import { Client } from '@notionhq/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as https from 'https'
import * as http from 'http'
import pLimit from 'p-limit'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NOTION_TOKEN = process.env.NOTION_TOKEN
if (!NOTION_TOKEN) {
  console.error('Missing NOTION_TOKEN environment variable')
  process.exit(1)
}

const ROOT_PAGE_ID = '2a9bf7526da84f7daa846a866faf1799'
const CONTENT_DIR = path.join(process.cwd(), '.content')
const IMAGES_DIR = path.join(process.cwd(), 'public', 'notion-images')

const notion = new Client({ auth: NOTION_TOKEN })
const apiLimit = pLimit(3) // Notion rate limit: 3 req/s
const imageLimit = pLimit(5)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageMeta {
  id: string
  title: string
  icon: string | null
  cover: string | null
  description: string | null
  published: string | null
  author: string | null
  lastEdited: string
  slug: string
  order: number | null
}

interface ManifestPage {
  slugPath: string[]
  title: string
  icon: string | null
  cover: string | null
  description: string | null
}

interface SlugTreeNode {
  pageId: string
  title: string
  children: Record<string, SlugTreeNode>
}

interface Manifest {
  syncedAt: string
  slugTree: Record<string, SlugTreeNode>
  pages: Record<string, ManifestPage>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuidToId(uuid: string): string {
  return uuid.replace(/-/g, '')
}

function idToUuid(id: string): string {
  const hex = id.replace(/-/g, '')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getPageTitle(page: any): string {
  const titleProp = Object.values(page.properties).find(
    (prop: any) => prop.type === 'title'
  ) as any
  if (titleProp?.type === 'title') {
    return titleProp.title.map((t: any) => t.plain_text).join('')
  }
  return 'Untitled'
}

function getPagePropertyText(page: any, name: string): string | null {
  const prop = page.properties[name]
  if (!prop) return null
  switch (prop.type) {
    case 'rich_text':
      return prop.rich_text.map((t: any) => t.plain_text).join('') || null
    case 'title':
      return prop.title.map((t: any) => t.plain_text).join('') || null
    case 'date':
      return prop.date?.start || null
    case 'select':
      return prop.select?.name || null
    default:
      return null
  }
}

function getPagePropertyNumber(page: any, name: string): number | null {
  const prop = page.properties[name]
  if (prop?.type === 'number') return prop.number
  return null
}

function getPageCover(page: any): string | null {
  if (!page.cover) return null
  if (page.cover.type === 'external') return page.cover.external.url
  if (page.cover.type === 'file') return page.cover.file.url
  return null
}

function getPageIcon(page: any): string | null {
  if (!page.icon) return null
  if (page.icon.type === 'emoji') return page.icon.emoji
  if (page.icon.type === 'external') return page.icon.external.url
  if (page.icon.type === 'file') return page.icon.file.url
  return null
}

// ---------------------------------------------------------------------------
// Image downloading
// ---------------------------------------------------------------------------

const imageUrlMap = new Map<string, string>() // original URL -> local path

function hashUrl(url: string): string {
  // Strip query params for hashing (S3 signed URLs change)
  const clean = url.split('?')[0]
  return crypto.createHash('sha256').update(clean).digest('hex').slice(0, 16)
}

function getExtFromUrl(url: string): string {
  const pathname = url.split('?')[0]
  const ext = path.extname(pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif'].includes(ext)) {
    return ext
  }
  return '.jpg' // default
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    get(url, { headers: { 'User-Agent': 'notion-sync' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location
        if (location) {
          downloadFile(location, dest).then(resolve, reject)
          return
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`))
        return
      }
      const stream = fs.createWriteStream(dest)
      res.pipe(stream)
      stream.on('finish', () => { stream.close(); resolve() })
      stream.on('error', reject)
    }).on('error', reject)
  })
}

async function downloadImage(url: string): Promise<string> {
  if (imageUrlMap.has(url)) return imageUrlMap.get(url)!

  const hash = hashUrl(url)
  const ext = getExtFromUrl(url)
  const filename = `${hash}${ext}`
  const localPath = `/notion-images/${filename}`
  const destPath = path.join(IMAGES_DIR, filename)

  imageUrlMap.set(url, localPath)

  if (!fs.existsSync(destPath)) {
    try {
      await downloadFile(url, destPath)
      console.log(`  Downloaded: ${filename}`)
    } catch (err) {
      console.warn(`  Failed to download image: ${url}`, (err as Error).message)
      return url // fallback to original URL
    }
  }

  return localPath
}

// ---------------------------------------------------------------------------
// Notion API wrappers (rate-limited)
// ---------------------------------------------------------------------------

async function fetchPage(pageId: string): Promise<any> {
  return apiLimit(() => notion.pages.retrieve({ page_id: pageId }))
}

async function fetchMarkdown(pageId: string): Promise<string> {
  return apiLimit(async () => {
    // Use the Notion markdown export endpoint
    const response = await (notion as any).request({
      path: `pages/${pageId}/markdown`,
      method: 'GET',
    })
    return response.markdown || ''
  })
}

async function fetchDatabaseEntries(databaseId: string): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined

  do {
    const response: any = await apiLimit(() =>
      notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ property: 'Order', direction: 'ascending' }],
      }).catch(() =>
        notion.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
        })
      )
    )
    results.push(...response.results)
    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return results
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

const manifest: Manifest = {
  syncedAt: new Date().toISOString(),
  slugTree: {},
  pages: {},
}

// All images to download (collected during crawl, downloaded after)
const imagesToDownload: Array<{ url: string; pageId: string }> = []

function collectImageUrls(markdown: string, pageId: string) {
  // Match markdown images: ![...](url)
  const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = imgRegex.exec(markdown)) !== null) {
    const url = match[1].split(' ')[0] // strip title
    if (url.startsWith('http')) {
      imagesToDownload.push({ url, pageId })
    }
  }
}

async function crawlPage(
  pageId: string,
  knownSlugPath: string[] | null, // null = compute from title; set when caller already knows the path
  slugTree: Record<string, SlugTreeNode>,
): Promise<void> {
  const cleanId = uuidToId(pageId)
  const uuid = idToUuid(cleanId)
  const pageDir = path.join(CONTENT_DIR, 'pages', cleanId)
  fs.mkdirSync(pageDir, { recursive: true })

  console.log(`Crawling: ${cleanId}`)

  // Fetch page metadata and markdown in parallel
  const [page, markdown] = await Promise.all([
    fetchPage(uuid),
    fetchMarkdown(uuid),
  ])

  const title = getPageTitle(page)
  const slug = slugify(title) || cleanId
  const icon = getPageIcon(page)
  const cover = getPageCover(page)

  const meta: PageMeta = {
    id: page.id,
    title,
    icon,
    cover,
    description: getPagePropertyText(page, 'Description'),
    published: getPagePropertyText(page, 'Published'),
    author: getPagePropertyText(page, 'Author'),
    lastEdited: page.last_edited_time,
    slug,
    order: getPagePropertyNumber(page, 'Order'),
  }

  // Collect image URLs from markdown content
  collectImageUrls(markdown, cleanId)

  // Collect cover and file-type icon images
  if (cover?.startsWith('http')) {
    imagesToDownload.push({ url: cover, pageId: cleanId })
  }
  if (icon?.startsWith('http')) {
    imagesToDownload.push({ url: icon, pageId: cleanId })
  }

  // Write page files
  fs.writeFileSync(path.join(pageDir, 'meta.json'), JSON.stringify(meta, null, 2))
  fs.writeFileSync(path.join(pageDir, 'content.md'), markdown)

  // Build slug path: use known path if provided, otherwise root has [] and others get [slug]
  const isRoot = cleanId === uuidToId(ROOT_PAGE_ID)
  const slugPath = knownSlugPath ?? (isRoot ? [] : [slug])

  // Add to manifest
  manifest.pages[cleanId] = {
    slugPath,
    title,
    icon,
    cover,
    description: meta.description,
  }

  // Find child databases in markdown (look for <database> tags)
  const dbRegex = /<database\s+url="[^"]*\/([a-f0-9-]+)"[^>]*>/gi
  const dbMatches = [...markdown.matchAll(dbRegex)]

  // Also look for child_database blocks by fetching shallow blocks
  const childDatabases: Array<{ id: string; title: string }> = []
  try {
    const blocks = await apiLimit(() =>
      notion.blocks.children.list({ block_id: uuid, page_size: 100 })
    )
    for (const block of blocks.results) {
      if ('type' in block && (block as any).type === 'child_database') {
        childDatabases.push({
          id: block.id,
          title: (block as any).child_database?.title || 'Untitled',
        })
      }
    }
  } catch (err) {
    // Some pages may not allow block listing
  }

  // Also add databases found in markdown
  for (const match of dbMatches) {
    const dbId = match[1].replace(/-/g, '')
    const dbUuid = idToUuid(dbId)
    if (!childDatabases.find((d) => uuidToId(d.id) === dbId)) {
      childDatabases.push({ id: dbUuid, title: 'Database' })
    }
  }

  // Process each database
  const dbDir = path.join(pageDir, 'databases')
  const treeNode: SlugTreeNode = { pageId: cleanId, title, children: {} }

  if (childDatabases.length > 0) {
    fs.mkdirSync(dbDir, { recursive: true })

    for (const db of childDatabases) {
      const dbId = uuidToId(db.id)
      console.log(`  Database: ${db.title} (${dbId})`)

      try {
        const entries = await fetchDatabaseEntries(db.id)
        const dbEntries = entries.map((entry: any) => {
          const entryTitle = getPageTitle(entry)
          const entrySlug = slugify(entryTitle) || uuidToId(entry.id)
          const entryCover = getPageCover(entry)
          const entryIcon = getPageIcon(entry)

          if (entryCover?.startsWith('http')) {
            imagesToDownload.push({ url: entryCover, pageId: uuidToId(entry.id) })
          }
          if (entryIcon?.startsWith('http')) {
            imagesToDownload.push({ url: entryIcon, pageId: uuidToId(entry.id) })
          }

          return {
            id: entry.id,
            title: entryTitle,
            description: getPagePropertyText(entry, 'Description'),
            cover: entryCover,
            icon: entryIcon,
            slug: entrySlug,
            path: [...slugPath, entrySlug],
            published: getPagePropertyText(entry, 'Published'),
            author: getPagePropertyText(entry, 'Author'),
            lastEdited: entry.last_edited_time,
            order: getPagePropertyNumber(entry, 'Order'),
          }
        })

        fs.writeFileSync(
          path.join(dbDir, `${dbId}.json`),
          JSON.stringify(dbEntries, null, 2)
        )

        // Recurse into each database entry (entry.path is already correct)
        for (const entry of dbEntries) {
          await crawlPage(entry.id, entry.path, treeNode.children)
        }
      } catch (err) {
        console.warn(`  Failed to query database ${dbId}:`, (err as Error).message)
      }
    }
  }

  // Find child pages in blocks
  try {
    const blocks = await apiLimit(() =>
      notion.blocks.children.list({ block_id: uuid, page_size: 100 })
    )
    for (const block of blocks.results) {
      if ('type' in block && (block as any).type === 'child_page') {
        const childTitle = (block as any).child_page?.title || 'Untitled'
        const childSlug = slugify(childTitle) || uuidToId(block.id)
        await crawlPage(block.id, [...slugPath, childSlug], treeNode.children)
      }
    }
  } catch {
    // ignore
  }

  // Add to slug tree (only for non-root pages)
  if (isRoot) {
    // Root page: its children become top-level slug tree entries
    Object.assign(slugTree, treeNode.children)
  } else {
    slugTree[slug] = treeNode
  }
}

// ---------------------------------------------------------------------------
// Rewrite image URLs in all files
// ---------------------------------------------------------------------------

function rewriteImageUrls() {
  const pagesDir = path.join(CONTENT_DIR, 'pages')
  if (!fs.existsSync(pagesDir)) return

  const pageDirs = fs.readdirSync(pagesDir)
  for (const pageDir of pageDirs) {
    const dir = path.join(pagesDir, pageDir)
    if (!fs.statSync(dir).isDirectory()) continue

    // Rewrite content.md
    const mdPath = path.join(dir, 'content.md')
    if (fs.existsSync(mdPath)) {
      let content = fs.readFileSync(mdPath, 'utf-8')
      for (const [originalUrl, localPath] of imageUrlMap) {
        content = content.split(originalUrl).join(localPath)
      }
      fs.writeFileSync(mdPath, content)
    }

    // Rewrite meta.json
    const metaPath = path.join(dir, 'meta.json')
    if (fs.existsSync(metaPath)) {
      let content = fs.readFileSync(metaPath, 'utf-8')
      for (const [originalUrl, localPath] of imageUrlMap) {
        content = content.split(originalUrl).join(localPath)
      }
      fs.writeFileSync(metaPath, content)
    }

    // Rewrite database JSON files
    const dbDir = path.join(dir, 'databases')
    if (fs.existsSync(dbDir)) {
      const dbFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'))
      for (const dbFile of dbFiles) {
        const dbPath = path.join(dbDir, dbFile)
        let content = fs.readFileSync(dbPath, 'utf-8')
        for (const [originalUrl, localPath] of imageUrlMap) {
          content = content.split(originalUrl).join(localPath)
        }
        fs.writeFileSync(dbPath, content)
      }
    }
  }

  // Also rewrite in manifest pages
  for (const pageId of Object.keys(manifest.pages)) {
    const page = manifest.pages[pageId]
    if (page.cover && imageUrlMap.has(page.cover)) {
      page.cover = imageUrlMap.get(page.cover)!
    }
    if (page.icon && imageUrlMap.has(page.icon)) {
      page.icon = imageUrlMap.get(page.icon)!
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Starting Notion sync...\n')

  // Clean existing content
  if (fs.existsSync(CONTENT_DIR)) {
    fs.rmSync(CONTENT_DIR, { recursive: true })
  }
  fs.mkdirSync(path.join(CONTENT_DIR, 'pages'), { recursive: true })
  fs.mkdirSync(IMAGES_DIR, { recursive: true })

  // Crawl pages (null = root, compute path automatically)
  await crawlPage(idToUuid(ROOT_PAGE_ID), null, manifest.slugTree)

  // Download all images
  console.log(`\nDownloading ${imagesToDownload.length} images...`)
  const uniqueUrls = [...new Set(imagesToDownload.map((i) => i.url))]
  await Promise.all(uniqueUrls.map((url) => imageLimit(() => downloadImage(url))))

  // Rewrite URLs
  console.log('\nRewriting image URLs...')
  rewriteImageUrls()

  // Write manifest
  fs.writeFileSync(
    path.join(CONTENT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )

  console.log(`\nSync complete!`)
  console.log(`  Pages: ${Object.keys(manifest.pages).length}`)
  console.log(`  Images: ${imageUrlMap.size}`)
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
