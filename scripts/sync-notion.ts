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

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
const useBlob = !!BLOB_TOKEN

const ROOT_PAGE_ID = '2a9bf7526da84f7daa846a866faf1799'
const CONTENT_DIR = path.join(process.cwd(), '.content')
const IMAGES_DIR = path.join(process.cwd(), 'public', 'notion-images')
const IMAGE_MAP_PATH = path.join(CONTENT_DIR, 'image-map.json')

const notion = new Client({ auth: NOTION_TOKEN })
const apiLimit = pLimit(8)
const imageLimit = pLimit(10)

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.code === 'rate_limited'
      if (!isRateLimit || attempt === retries) throw err
      const retryAfter = (err?.headers?.['retry-after'] ?? attempt + 1) as number
      const delay = retryAfter * 1000
      console.warn(`  Rate limited, retrying in ${retryAfter}s...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const forceMode = args.includes('--force')
const repairIdx = args.indexOf('--repair')
const repairTarget = repairIdx !== -1 ? args[repairIdx + 1] : null
const imagesMode = args.includes('--images')
const mode: 'force' | 'repair' | 'images' | 'incremental' = forceMode
  ? 'force'
  : repairTarget
    ? 'repair'
    : imagesMode
      ? 'images'
      : 'incremental'

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

interface DiscoveredPage {
  cleanId: string
  uuid: string
  title: string
  slug: string
  icon: string | null
  cover: string | null
  description: string | null
  published: string | null
  author: string | null
  lastEdited: string
  order: number | null
  slugPath: string[]
  childDatabases: Array<{ id: string; title: string }>
  childPages: Array<{ id: string; title: string; slug: string }>
  dbEntries: Map<string, any[]>
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
// Persistence helpers
// ---------------------------------------------------------------------------

function loadExistingManifest(): Manifest | null {
  const manifestPath = path.join(CONTENT_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}

function loadExistingMeta(pageId: string): PageMeta | null {
  const metaPath = path.join(CONTENT_DIR, 'pages', pageId, 'meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

function loadExistingImageMap(): Record<string, string> {
  if (!fs.existsSync(IMAGE_MAP_PATH)) return {}
  try {
    return JSON.parse(fs.readFileSync(IMAGE_MAP_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function pageNeedsUpdate(pageId: string, notionLastEdited: string): boolean {
  const existingMeta = loadExistingMeta(pageId)
  if (!existingMeta) return true
  return notionLastEdited > existingMeta.lastEdited
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

// Maps original URL (without query params) hash -> final served URL
const imageUrlMap = new Map<string, string>() // original URL -> served path/url

function hashUrl(url: string): string {
  const clean = url.split('?')[0]
  return crypto.createHash('sha256').update(clean).digest('hex').slice(0, 16)
}

function getExtFromUrl(url: string): string {
  const pathname = url.split('?')[0]
  const ext = path.extname(pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif'].includes(ext)) {
    return ext
  }
  return '.jpg'
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

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    get(url, { headers: { 'User-Agent': 'notion-sync' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location
        if (location) {
          downloadToBuffer(location).then(resolve, reject)
          return
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// Persistent map: hash -> served URL (survives across runs)
let persistedImageMap: Record<string, string> = {}

async function blobHead(urlOrPathname: string): Promise<{ url: string } | null> {
  const { head } = await import('@vercel/blob')
  try {
    return await head(urlOrPathname, { token: BLOB_TOKEN! })
  } catch {
    return null
  }
}

async function uploadImage(url: string): Promise<string> {
  if (imageUrlMap.has(url)) return imageUrlMap.get(url)!

  const hash = hashUrl(url)
  const ext = getExtFromUrl(url)
  const filename = `${hash}${ext}`

  // Check if already uploaded in a previous run
  if (persistedImageMap[hash]) {
    const cachedUrl = persistedImageMap[hash]
    if (useBlob && cachedUrl.startsWith('https://')) {
      // Validate the blob still exists
      const existing = await blobHead(cachedUrl)
      if (existing) {
        imageUrlMap.set(url, cachedUrl)
        return cachedUrl
      }
      // Gone from store — delete stale entry and re-upload below
      console.warn(`  Blob missing for ${filename}, re-uploading...`)
      delete persistedImageMap[hash]
    } else {
      // Local path — trust it (or could add fs.existsSync check)
      imageUrlMap.set(url, cachedUrl)
      return cachedUrl
    }
  }

  if (useBlob) {
    // Check if blob already exists at this pathname (avoids collision)
    const existing = await blobHead(`notion-images/${filename}`)
    if (existing) {
      imageUrlMap.set(url, existing.url)
      persistedImageMap[hash] = existing.url
      console.log(`  Blob exists: ${filename}`)
      return existing.url
    }

    // Upload to Vercel Blob with retry (only retries transient errors)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buffer = await downloadToBuffer(url)
        const { put } = await import('@vercel/blob')
        const blob = await put(`notion-images/${filename}`, buffer, {
          access: 'public',
          token: BLOB_TOKEN,
          addRandomSuffix: false,
        })
        const servedUrl = blob.url
        imageUrlMap.set(url, servedUrl)
        persistedImageMap[hash] = servedUrl
        console.log(`  Uploaded to blob: ${filename}`)
        return servedUrl
      } catch (err) {
        const msg = (err as Error).message || ''
        // Don't retry on HTTP client errors (403 expired URL, 404 not found, etc.)
        const isHttpClientError = /: 4\d{2}$/.test(msg)
        if (isHttpClientError || attempt === 2) {
          console.warn(`  Failed to upload image: ${url}`, msg)
          imageUrlMap.set(url, url)
          return url
        }
        console.warn(`  Upload attempt ${attempt + 1} failed, retrying in ${(attempt + 1)}s...`)
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000))
      }
    }
    // Unreachable but satisfies TS
    imageUrlMap.set(url, url)
    return url
  } else {
    // Local download fallback
    const localPath = `/notion-images/${filename}`
    const destPath = path.join(IMAGES_DIR, filename)

    imageUrlMap.set(url, localPath)
    persistedImageMap[hash] = localPath

    if (!fs.existsSync(destPath)) {
      try {
        await downloadFile(url, destPath)
        console.log(`  Downloaded: ${filename}`)
      } catch (err) {
        console.warn(`  Failed to download image: ${url}`, (err as Error).message)
        return url
      }
    }

    return localPath
  }
}

// ---------------------------------------------------------------------------
// Notion API wrappers (rate-limited)
// ---------------------------------------------------------------------------

async function fetchPage(pageId: string): Promise<any> {
  return apiLimit(() => withRetry(() => notion.pages.retrieve({ page_id: pageId })))
}

async function fetchBlocksShallow(pageId: string): Promise<any[]> {
  return apiLimit(() => withRetry(async () => {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 })
    return response.results
  }))
}

async function fetchBlocksDeep(blockId: string): Promise<any[]> {
  const blocks = await apiLimit(() => withRetry(async () => {
    const allBlocks: any[] = []
    let cursor: string | undefined
    do {
      const response = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      })
      for (const block of response.results) {
        if ('type' in block) {
          allBlocks.push(block)
        }
      }
      cursor = response.next_cursor ?? undefined
    } while (cursor)
    return allBlocks
  }))

  // Recursively fetch children for blocks that have them
  const childrenNeeded = blocks.filter((b: any) => b.has_children && b.type !== 'child_page' && b.type !== 'child_database')
  if (childrenNeeded.length > 0) {
    const childResults = await Promise.all(
      childrenNeeded.map((b: any) => fetchBlocksDeep(b.id))
    )
    childrenNeeded.forEach((b: any, i: number) => { b.children = childResults[i] })
  }

  return blocks
}

async function fetchDatabaseEntries(databaseId: string): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined

  do {
    const response: any = await apiLimit(() =>
      withRetry(() =>
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
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
          })
        )
      )
    )
    results.push(...response.results)
    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return results
}

// ---------------------------------------------------------------------------
// Image URL collection from blocks
// ---------------------------------------------------------------------------

const imagesToProcess: string[] = []

function collectImageUrlsFromBlocks(blocks: any[]) {
  for (const block of blocks) {
    const type = block.type
    if (type === 'image') {
      const img = block.image
      const src = img?.type === 'external' ? img.external?.url : img?.file?.url
      if (src?.startsWith('http')) imagesToProcess.push(src)
    }
    if (type === 'video') {
      const vid = block.video
      const src = vid?.type === 'file' ? vid.file?.url : null
      if (src?.startsWith('http')) imagesToProcess.push(src)
    }
    if (block.children) {
      collectImageUrlsFromBlocks(block.children)
    }
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const manifest: Manifest = {
  syncedAt: new Date().toISOString(),
  slugTree: {},
  pages: {},
}

const discoveredPages = new Map<string, DiscoveredPage>()
const syncedPageIds = new Set<string>()

// ---------------------------------------------------------------------------
// Phase 1: Discovery (lightweight tree walk)
// ---------------------------------------------------------------------------

async function discoverPage(
  pageId: string,
  knownSlugPath: string[] | null,
  slugTree: Record<string, SlugTreeNode>,
): Promise<void> {
  const cleanId = uuidToId(pageId)
  const uuid = idToUuid(cleanId)

  console.log(`Discovering: ${cleanId}`)

  const [page, topBlocks] = await Promise.all([
    fetchPage(uuid),
    fetchBlocksShallow(uuid).catch(() => [] as any[]),
  ])

  // Fetch children of structural blocks (column_list, column, synced_block, etc.)
  // so we can discover child_page/child_database blocks nested inside them
  const structuralTypes = new Set(['column_list', 'column', 'synced_block', 'toggle', 'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'table'])
  async function expandStructuralBlocks(blocks: any[]): Promise<any[]> {
    const needsChildren = blocks.filter((b: any) =>
      'type' in b && b.has_children && structuralTypes.has(b.type)
    )
    if (needsChildren.length === 0) return blocks

    const childResults = await Promise.all(
      needsChildren.map((b: any) => fetchBlocksShallow(b.id).catch(() => [] as any[]))
    )
    for (let i = 0; i < needsChildren.length; i++) {
      needsChildren[i].children = childResults[i]
      // Recurse one more level (e.g. column_list > column > child_page)
      needsChildren[i].children = await expandStructuralBlocks(needsChildren[i].children)
    }
    return blocks
  }
  const blocks = await expandStructuralBlocks(topBlocks)

  const title = getPageTitle(page)
  const slug = slugify(title) || cleanId
  const isRoot = cleanId === uuidToId(ROOT_PAGE_ID)
  const slugPath = knownSlugPath ?? (isRoot ? [] : [slug])

  const childDatabases: Array<{ id: string; title: string }> = []
  const childPages: Array<{ id: string; title: string; slug: string }> = []

  function collectChildrenFromBlocks(blockList: any[]) {
    for (const block of blockList) {
      if (!('type' in block)) continue
      if (block.type === 'child_database') {
        childDatabases.push({
          id: block.id,
          title: (block as any).child_database?.title || 'Untitled',
        })
      } else if (block.type === 'child_page') {
        const childTitle = (block as any).child_page?.title || 'Untitled'
        const childSlug = slugify(childTitle) || uuidToId(block.id)
        childPages.push({ id: block.id, title: childTitle, slug: childSlug })
      }
      if (block.children) {
        collectChildrenFromBlocks(block.children)
      }
    }
  }
  collectChildrenFromBlocks(blocks)

  const dbEntries = new Map<string, any[]>()
  for (const db of childDatabases) {
    const dbId = uuidToId(db.id)
    console.log(`  Database: ${db.title} (${dbId})`)
    try {
      const entries = await fetchDatabaseEntries(db.id)
      dbEntries.set(dbId, entries)
    } catch (err) {
      console.warn(`  Failed to query database ${dbId}:`, (err as Error).message)
    }
  }

  const discovered: DiscoveredPage = {
    cleanId,
    uuid,
    title,
    slug,
    icon: getPageIcon(page),
    cover: getPageCover(page),
    description: getPagePropertyText(page, 'Description'),
    published: getPagePropertyText(page, 'Published'),
    author: getPagePropertyText(page, 'Author'),
    lastEdited: page.last_edited_time,
    order: getPagePropertyNumber(page, 'Order'),
    slugPath,
    childDatabases,
    childPages,
    dbEntries,
  }
  discoveredPages.set(cleanId, discovered)

  const treeNode: SlugTreeNode = { pageId: cleanId, title, children: {} }

  for (const db of childDatabases) {
    const dbId = uuidToId(db.id)
    const entries = dbEntries.get(dbId)
    if (!entries) continue

    for (const entry of entries) {
      const entryTitle = getPageTitle(entry)
      const entrySlug = slugify(entryTitle) || uuidToId(entry.id)
      const entryPath = [...slugPath, entrySlug]
      await discoverPage(entry.id, entryPath, treeNode.children)
    }
  }

  for (const child of childPages) {
    await discoverPage(child.id, [...slugPath, child.slug], treeNode.children)
  }

  if (isRoot) {
    Object.assign(slugTree, treeNode.children)
  } else {
    slugTree[slug] = treeNode
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Content sync (fetch deep blocks for changed pages)
// ---------------------------------------------------------------------------

async function syncPageContent(discovered: DiscoveredPage): Promise<void> {
  const { cleanId, uuid, title, slug, slugPath, childDatabases, dbEntries } = discovered
  const pageDir = path.join(CONTENT_DIR, 'pages', cleanId)
  fs.mkdirSync(pageDir, { recursive: true })

  console.log(`Syncing content: ${cleanId} (${title})`)

  // Fetch full recursive block tree
  const blocks = await fetchBlocksDeep(uuid)

  const meta: PageMeta = {
    id: discovered.uuid,
    title,
    icon: discovered.icon,
    cover: discovered.cover,
    description: discovered.description,
    published: discovered.published,
    author: discovered.author,
    lastEdited: discovered.lastEdited,
    slug,
    order: discovered.order,
  }

  // Collect image URLs from blocks
  collectImageUrlsFromBlocks(blocks)

  // Collect cover and file-type icon images
  if (discovered.cover?.startsWith('http')) {
    imagesToProcess.push(discovered.cover)
  }
  if (discovered.icon?.startsWith('http')) {
    imagesToProcess.push(discovered.icon)
  }

  // Write page files
  fs.writeFileSync(path.join(pageDir, 'meta.json'), JSON.stringify(meta, null, 2))
  fs.writeFileSync(path.join(pageDir, 'blocks.json'), JSON.stringify(blocks, null, 2))

  // Process database entries — write DB JSON files and collect entry images
  if (childDatabases.length > 0) {
    const dbDir = path.join(pageDir, 'databases')
    fs.mkdirSync(dbDir, { recursive: true })

    for (const db of childDatabases) {
      const dbId = uuidToId(db.id)
      const entries = dbEntries.get(dbId)
      if (!entries) continue

      const dbEntriesData = entries.map((entry: any) => {
        const entryTitle = getPageTitle(entry)
        const entrySlug = slugify(entryTitle) || uuidToId(entry.id)
        const entryCover = getPageCover(entry)
        const entryIcon = getPageIcon(entry)

        if (entryCover?.startsWith('http')) {
          imagesToProcess.push(entryCover)
        }
        if (entryIcon?.startsWith('http')) {
          imagesToProcess.push(entryIcon)
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
        JSON.stringify(dbEntriesData, null, 2)
      )
    }
  }

  syncedPageIds.add(cleanId)
}

// ---------------------------------------------------------------------------
// Rewrite image URLs in synced pages' JSON files
// ---------------------------------------------------------------------------

function rewriteImageUrls(pageIds: Set<string>) {
  const pagesDir = path.join(CONTENT_DIR, 'pages')
  if (!fs.existsSync(pagesDir)) return

  for (const pageId of pageIds) {
    const dir = path.join(pagesDir, pageId)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue

    // Rewrite blocks.json
    const blocksPath = path.join(dir, 'blocks.json')
    if (fs.existsSync(blocksPath)) {
      let content = fs.readFileSync(blocksPath, 'utf-8')
      for (const [originalUrl, localPath] of imageUrlMap) {
        content = content.split(originalUrl).join(localPath)
      }
      fs.writeFileSync(blocksPath, content)
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

  // Also rewrite in manifest pages (only synced ones)
  for (const pageId of pageIds) {
    const page = manifest.pages[pageId]
    if (!page) continue
    if (page.cover && imageUrlMap.has(page.cover)) {
      page.cover = imageUrlMap.get(page.cover)!
    }
    if (page.icon && imageUrlMap.has(page.icon)) {
      page.icon = imageUrlMap.get(page.icon)!
    }
  }
}

// ---------------------------------------------------------------------------
// Repair mode
// ---------------------------------------------------------------------------

async function repairPage(target: string): Promise<void> {
  const existingManifest = loadExistingManifest()
  if (!existingManifest) {
    console.error('No existing manifest found. Run a full sync first.')
    process.exit(1)
  }

  const normalizedTarget = target.replace(/-/g, '')
  const isIdLike = /^[a-f0-9]{32}$/.test(normalizedTarget)

  let matchedIds: string[] = []

  if (isIdLike) {
    if (existingManifest.pages[normalizedTarget]) {
      matchedIds = [normalizedTarget]
    }
  }

  if (matchedIds.length === 0) {
    const lowerTarget = target.toLowerCase()
    for (const [id, page] of Object.entries(existingManifest.pages)) {
      if (page.title.toLowerCase().includes(lowerTarget)) {
        matchedIds.push(id)
      }
    }
  }

  if (matchedIds.length === 0) {
    console.error(`No page found matching "${target}"`)
    process.exit(1)
  }

  if (matchedIds.length > 1) {
    console.error(`Multiple pages match "${target}":`)
    for (const id of matchedIds) {
      const page = existingManifest.pages[id]
      console.error(`  ${id} — ${page.title}`)
    }
    process.exit(1)
  }

  const pageId = matchedIds[0]
  const existingEntry = existingManifest.pages[pageId]
  const uuid = idToUuid(pageId)

  console.log(`Repairing: ${pageId} (${existingEntry.title})\n`)

  fs.mkdirSync(path.join(CONTENT_DIR, 'pages'), { recursive: true })
  if (!useBlob) fs.mkdirSync(IMAGES_DIR, { recursive: true })

  persistedImageMap = loadExistingImageMap()

  // Fetch page metadata and deep blocks
  const [page, blocks] = await Promise.all([
    fetchPage(uuid),
    fetchBlocksDeep(uuid),
  ])

  const title = getPageTitle(page)
  const slug = slugify(title) || pageId
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

  // Collect images
  collectImageUrlsFromBlocks(blocks)
  if (cover?.startsWith('http')) imagesToProcess.push(cover)
  if (icon?.startsWith('http')) imagesToProcess.push(icon)

  // Write page files
  const pageDir = path.join(CONTENT_DIR, 'pages', pageId)
  fs.mkdirSync(pageDir, { recursive: true })
  fs.writeFileSync(path.join(pageDir, 'meta.json'), JSON.stringify(meta, null, 2))
  fs.writeFileSync(path.join(pageDir, 'blocks.json'), JSON.stringify(blocks, null, 2))

  // Process child databases
  const childDatabases: Array<{ id: string; title: string }> = []
  for (const block of blocks) {
    if ('type' in block && (block as any).type === 'child_database') {
      childDatabases.push({
        id: block.id,
        title: (block as any).child_database?.title || 'Untitled',
      })
    }
  }

  if (childDatabases.length > 0) {
    const dbDir = path.join(pageDir, 'databases')
    fs.mkdirSync(dbDir, { recursive: true })

    for (const db of childDatabases) {
      const dbId = uuidToId(db.id)
      try {
        const entries = await fetchDatabaseEntries(db.id)
        const dbEntries = entries.map((entry: any) => {
          const entryTitle = getPageTitle(entry)
          const entrySlug = slugify(entryTitle) || uuidToId(entry.id)
          const entryCover = getPageCover(entry)
          const entryIcon = getPageIcon(entry)

          if (entryCover?.startsWith('http')) imagesToProcess.push(entryCover)
          if (entryIcon?.startsWith('http')) imagesToProcess.push(entryIcon)

          return {
            id: entry.id,
            title: entryTitle,
            description: getPagePropertyText(entry, 'Description'),
            cover: entryCover,
            icon: entryIcon,
            slug: entrySlug,
            path: [...existingEntry.slugPath, entrySlug],
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
      } catch (err) {
        console.warn(`  Failed to query database ${dbId}:`, (err as Error).message)
      }
    }
  }

  syncedPageIds.add(pageId)

  // Upload/download images
  const uniqueUrls = [...new Set(imagesToProcess)]
  if (uniqueUrls.length > 0) {
    console.log(`\nProcessing ${uniqueUrls.length} images...`)
    await Promise.all(uniqueUrls.map((url) => imageLimit(() => uploadImage(url))))
  }

  // Rewrite URLs in repaired page only
  rewriteImageUrls(syncedPageIds)

  // Update manifest entry in-place
  existingManifest.pages[pageId] = {
    slugPath: existingEntry.slugPath,
    title,
    icon,
    cover,
    description: meta.description,
  }

  // Apply image URL rewrites to the manifest entry
  const entry = existingManifest.pages[pageId]
  if (entry.cover && imageUrlMap.has(entry.cover)) {
    entry.cover = imageUrlMap.get(entry.cover)!
  }
  if (entry.icon && imageUrlMap.has(entry.icon)) {
    entry.icon = imageUrlMap.get(entry.icon)!
  }

  existingManifest.syncedAt = new Date().toISOString()
  fs.writeFileSync(
    path.join(CONTENT_DIR, 'manifest.json'),
    JSON.stringify(existingManifest, null, 2)
  )
  fs.writeFileSync(IMAGE_MAP_PATH, JSON.stringify(persistedImageMap, null, 2))

  console.log(`\nRepair complete!`)
  console.log(`  Page: ${title} (${pageId})`)
  console.log(`  Images: ${imageUrlMap.size}`)
}

// ---------------------------------------------------------------------------
// Images mode: validate and repair images without re-syncing from Notion
// ---------------------------------------------------------------------------

async function imagesRepair(): Promise<void> {
  console.log('Images mode: validating and repairing image references...\n')

  persistedImageMap = loadExistingImageMap()
  const existingManifest = loadExistingManifest()
  if (!existingManifest) {
    console.error('No existing manifest found. Run a full sync first.')
    process.exit(1)
  }

  const pagesDir = path.join(CONTENT_DIR, 'pages')
  if (!fs.existsSync(pagesDir)) {
    console.error('No pages directory found. Run a full sync first.')
    process.exit(1)
  }

  // Step 1: Validate all entries in persistedImageMap
  let staleCount = 0
  let validCount = 0
  const staleHashes = new Set<string>()

  if (useBlob) {
    console.log('Validating blob URLs in image-map.json...')
    const entries = Object.entries(persistedImageMap)
    const validationLimit = pLimit(10)

    await Promise.all(
      entries.map(([hash, url]) =>
        validationLimit(async () => {
          if (!url.startsWith('https://')) return
          const exists = await blobHead(url)
          if (exists) {
            validCount++
          } else {
            console.warn(`  Stale: ${hash} -> ${url}`)
            staleHashes.add(hash)
            delete persistedImageMap[hash]
            staleCount++
          }
        })
      )
    )
    console.log(`  ${validCount} valid, ${staleCount} stale blobs removed.\n`)
  } else {
    console.log('Validating local image files...')
    for (const [hash, localPath] of Object.entries(persistedImageMap)) {
      if (!localPath.startsWith('/notion-images/')) continue
      const destPath = path.join(process.cwd(), 'public', localPath)
      if (fs.existsSync(destPath)) {
        validCount++
      } else {
        console.warn(`  Missing: ${hash} -> ${localPath}`)
        staleHashes.add(hash)
        delete persistedImageMap[hash]
        staleCount++
      }
    }
    console.log(`  ${validCount} valid, ${staleCount} missing files.\n`)
  }

  // Step 2: Scan all content files for unrewritten Notion image URLs
  // (these are from failed prior syncs where the URL was never replaced)
  const notionUrlPattern = /https:\/\/(?:prod-files-secure\.s3\.us-west-2\.amazonaws\.com|s3\.us-west-2\.amazonaws\.com\/secure\.notion-static\.com)[^\s"')]+/g
  const unrewrittenUrls = new Map<string, Set<string>>() // url -> set of page IDs
  const pageDirs = fs.readdirSync(pagesDir).filter((d) => {
    const stat = fs.statSync(path.join(pagesDir, d))
    return stat.isDirectory()
  })

  console.log('Scanning content files for unrewritten Notion URLs...')
  for (const pageId of pageDirs) {
    const dir = path.join(pagesDir, pageId)
    const filesToScan = ['blocks.json', 'meta.json']
    const dbDir = path.join(dir, 'databases')
    if (fs.existsSync(dbDir)) {
      const dbFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'))
      filesToScan.push(...dbFiles.map((f) => `databases/${f}`))
    }

    for (const file of filesToScan) {
      const filePath = path.join(dir, file)
      if (!fs.existsSync(filePath)) continue
      const content = fs.readFileSync(filePath, 'utf-8')
      const matches = content.match(notionUrlPattern)
      if (matches) {
        for (const url of matches) {
          if (!unrewrittenUrls.has(url)) unrewrittenUrls.set(url, new Set())
          unrewrittenUrls.get(url)!.add(pageId)
        }
      }
    }
  }

  if (unrewrittenUrls.size > 0) {
    console.log(`  Found ${unrewrittenUrls.size} unrewritten Notion URLs.`)
  } else {
    console.log('  No unrewritten Notion URLs found.')
  }

  // Step 3: Identify pages that need fresh blocks fetched (for stale blobs)
  // Build reverse map: blob URL -> hash, then find which pages reference stale URLs
  const pagesNeedingRefresh = new Set<string>()

  if (staleHashes.size > 0) {
    console.log('\nIdentifying pages affected by stale blob URLs...')
    // We need to scan files for the stale blob URLs to find affected pages
    // But the files already have the blob URLs written in them, so we need to
    // re-fetch blocks from Notion to get fresh signed URLs
    for (const pageId of pageDirs) {
      const dir = path.join(pagesDir, pageId)
      const filesToScan = ['blocks.json', 'meta.json']
      const dbDir = path.join(dir, 'databases')
      if (fs.existsSync(dbDir)) {
        const dbFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'))
        filesToScan.push(...dbFiles.map((f) => `databases/${f}`))
      }

      for (const file of filesToScan) {
        const filePath = path.join(dir, file)
        if (!fs.existsSync(filePath)) continue
        const content = fs.readFileSync(filePath, 'utf-8')
        // Check if any stale blob URL appears in this file
        // We don't have the old URLs anymore, but we can check for stale hashes
        // by looking for the hash pattern in filenames
        for (const hash of staleHashes) {
          if (content.includes(hash)) {
            pagesNeedingRefresh.add(pageId)
            break
          }
        }
      }
    }
    if (pagesNeedingRefresh.size > 0) {
      console.log(`  ${pagesNeedingRefresh.size} pages need re-fetching from Notion.`)
    }
  }

  // Step 4: Attempt to download+upload unrewritten URLs directly
  if (unrewrittenUrls.size > 0) {
    console.log('\nAttempting to upload unrewritten images...')
    const allUnrewritten = [...unrewrittenUrls.keys()]
    const failedUrls = new Map<string, Set<string>>() // url -> page IDs

    await Promise.all(
      allUnrewritten.map((url) =>
        imageLimit(async () => {
          const result = await uploadImage(url)
          if (result === url) {
            // Failed — likely expired signed URL
            failedUrls.set(url, unrewrittenUrls.get(url)!)
          }
        })
      )
    )

    // Rewrite successfully uploaded URLs in affected files
    if (imageUrlMap.size > 0) {
      const affectedPages = new Set<string>()
      for (const [, pageIds] of unrewrittenUrls) {
        for (const pid of pageIds) affectedPages.add(pid)
      }
      rewriteImageUrls(affectedPages)
    }

    if (failedUrls.size > 0) {
      // Add pages with failed URLs to the refresh set
      for (const [, pageIds] of failedUrls) {
        for (const pid of pageIds) pagesNeedingRefresh.add(pid)
      }
      console.log(`  ${failedUrls.size} URLs failed (likely expired). Pages will be re-fetched.`)
    }
  }

  // Step 5: Re-fetch blocks from Notion for pages with stale/failed images
  if (pagesNeedingRefresh.size > 0) {
    console.log(`\nRe-fetching ${pagesNeedingRefresh.size} pages from Notion for fresh image URLs...`)

    for (const pageId of pagesNeedingRefresh) {
      const uuid = idToUuid(pageId)
      const pageEntry = existingManifest.pages[pageId]
      if (!pageEntry) continue

      console.log(`  Re-fetching: ${pageId} (${pageEntry.title})`)
      try {
        const [page, blocks] = await Promise.all([
          fetchPage(uuid),
          fetchBlocksDeep(uuid),
        ])

        const title = getPageTitle(page)
        const icon = getPageIcon(page)
        const cover = getPageCover(page)

        // Collect fresh image URLs
        const freshImages: string[] = []
        collectImageUrlsFromBlocks(blocks)
        if (cover?.startsWith('http')) freshImages.push(cover)
        if (icon?.startsWith('http')) freshImages.push(icon)

        // Write fresh blocks
        const pageDir = path.join(pagesDir, pageId)
        fs.mkdirSync(pageDir, { recursive: true })

        const meta: PageMeta = {
          id: page.id,
          title,
          icon,
          cover,
          description: getPagePropertyText(page, 'Description'),
          published: getPagePropertyText(page, 'Published'),
          author: getPagePropertyText(page, 'Author'),
          lastEdited: page.last_edited_time,
          slug: slugify(title) || pageId,
          order: getPagePropertyNumber(page, 'Order'),
        }

        fs.writeFileSync(path.join(pageDir, 'meta.json'), JSON.stringify(meta, null, 2))
        fs.writeFileSync(path.join(pageDir, 'blocks.json'), JSON.stringify(blocks, null, 2))

        // Upload fresh images
        const uniqueFresh = [...new Set(freshImages)]
        if (uniqueFresh.length > 0) {
          await Promise.all(uniqueFresh.map((url) => imageLimit(() => uploadImage(url))))
        }

        syncedPageIds.add(pageId)
      } catch (err) {
        console.warn(`  Failed to re-fetch page ${pageId}:`, (err as Error).message)
        console.warn(`  Run 'pnpm sync:repair "${pageEntry.title}"' to fix this page.`)
      }
    }

    // Process any newly collected images from collectImageUrlsFromBlocks
    const uniqueUrls = [...new Set(imagesToProcess)]
    if (uniqueUrls.length > 0) {
      console.log(`\nProcessing ${uniqueUrls.length} collected images...`)
      await Promise.all(uniqueUrls.map((url) => imageLimit(() => uploadImage(url))))
    }

    // Rewrite URLs in re-fetched pages
    if (syncedPageIds.size > 0) {
      rewriteImageUrls(syncedPageIds)
    }
  }

  // Step 6: Save updated image map
  fs.writeFileSync(IMAGE_MAP_PATH, JSON.stringify(persistedImageMap, null, 2))

  console.log(`\nImages repair complete!`)
  console.log(`  Validated: ${validCount}`)
  console.log(`  Stale removed: ${staleCount}`)
  console.log(`  Newly uploaded: ${imageUrlMap.size}`)
  console.log(`  Pages re-fetched: ${pagesNeedingRefresh.size}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Starting Notion sync (mode: ${mode})...\n`)
  if (useBlob) console.log('Using Vercel Blob for image storage.\n')
  else console.log('Using local image storage (set BLOB_READ_WRITE_TOKEN for Vercel Blob).\n')

  // Images mode: handle separately and exit
  if (mode === 'images') {
    await imagesRepair()
    return
  }

  // Repair mode: handle separately and exit
  if (mode === 'repair') {
    if (!repairTarget) {
      console.error('Usage: pnpm sync -- --repair <name-or-id>')
      process.exit(1)
    }
    await repairPage(repairTarget)
    return
  }

  // Force mode: clean slate
  if (mode === 'force') {
    if (fs.existsSync(CONTENT_DIR)) {
      fs.rmSync(CONTENT_DIR, { recursive: true })
    }
    if (!useBlob && fs.existsSync(IMAGES_DIR)) {
      fs.rmSync(IMAGES_DIR, { recursive: true })
    }
  }

  // Ensure directories exist
  fs.mkdirSync(path.join(CONTENT_DIR, 'pages'), { recursive: true })
  if (!useBlob) fs.mkdirSync(IMAGES_DIR, { recursive: true })

  // Load existing state
  const existingManifest = mode === 'incremental' ? loadExistingManifest() : null
  persistedImageMap = mode === 'force' ? {} : loadExistingImageMap()

  // Phase 1: Discover full page tree
  console.log('Phase 1: Discovering pages...\n')
  await discoverPage(idToUuid(ROOT_PAGE_ID), null, manifest.slugTree)
  console.log(`\nDiscovered ${discoveredPages.size} pages.`)

  // Phase 2: Sync content for changed pages
  console.log('\nPhase 2: Syncing content...\n')
  let updatedCount = 0
  let skippedCount = 0

  for (const [cleanId, discovered] of discoveredPages) {
    const needsUpdate =
      mode === 'force' ||
      !existingManifest ||
      pageNeedsUpdate(cleanId, discovered.lastEdited)

    if (needsUpdate) {
      await syncPageContent(discovered)
      updatedCount++
    } else {
      skippedCount++
    }

    // Build manifest entry
    const existingEntry = existingManifest?.pages[cleanId]
    if (!needsUpdate && existingEntry) {
      manifest.pages[cleanId] = {
        slugPath: discovered.slugPath,
        title: discovered.title,
        icon: existingEntry.icon,
        cover: existingEntry.cover,
        description: discovered.description,
      }
    } else {
      manifest.pages[cleanId] = {
        slugPath: discovered.slugPath,
        title: discovered.title,
        icon: discovered.icon,
        cover: discovered.cover,
        description: discovered.description,
      }
    }
  }

  console.log(`\n${updatedCount} pages updated, ${skippedCount} pages unchanged.`)

  // Clean orphaned page directories (incremental only)
  if (mode === 'incremental') {
    const pagesDir = path.join(CONTENT_DIR, 'pages')
    if (fs.existsSync(pagesDir)) {
      const existingDirs = fs.readdirSync(pagesDir)
      let removedCount = 0
      for (const dir of existingDirs) {
        if (!discoveredPages.has(dir)) {
          fs.rmSync(path.join(pagesDir, dir), { recursive: true })
          removedCount++
        }
      }
      if (removedCount > 0) {
        console.log(`Removed ${removedCount} orphaned page directories.`)
      }
    }
  }

  // Upload/download images
  const uniqueUrls = [...new Set(imagesToProcess)]
  if (uniqueUrls.length > 0) {
    console.log(`\nProcessing ${uniqueUrls.length} images...`)
    await Promise.all(uniqueUrls.map((url) => imageLimit(() => uploadImage(url))))
  }

  // Rewrite URLs only in pages synced this run
  if (syncedPageIds.size > 0) {
    console.log('\nRewriting image URLs...')
    rewriteImageUrls(syncedPageIds)
  }

  // Write manifest and image map
  fs.writeFileSync(
    path.join(CONTENT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  fs.writeFileSync(IMAGE_MAP_PATH, JSON.stringify(persistedImageMap, null, 2))

  console.log(`\nSync complete!`)
  console.log(`  Pages: ${Object.keys(manifest.pages).length}`)
  console.log(`  Updated: ${updatedCount}`)
  console.log(`  Skipped: ${skippedCount}`)
  console.log(`  Images: ${imageUrlMap.size}`)
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
