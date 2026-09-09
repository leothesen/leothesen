import * as fs from 'fs'
import * as path from 'path'
import type { NotionBlock } from './notion-api'
import type { DatabaseEntry } from './types'

const CONTENT_DIR = path.join(process.cwd(), '.content')

export interface LocalPageData {
  meta: {
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
  blocks: NotionBlock[]
  databaseEntries: Record<string, DatabaseEntry[]>
}

export interface LocalManifest {
  syncedAt: string
  slugTree: Record<string, SlugTreeNode>
  pages: Record<string, {
    slugPath: string[]
    title: string
    icon: string | null
    cover: string | null
    description: string | null
  }>
}

interface SlugTreeNode {
  pageId: string
  title: string
  children: Record<string, SlugTreeNode>
}

let manifestCache: LocalManifest | null = null

export function getManifest(): LocalManifest {
  if (manifestCache) return manifestCache
  const manifestPath = path.join(CONTENT_DIR, 'manifest.json')
  manifestCache = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  return manifestCache!
}

export function getLocalPage(pageId: string): LocalPageData | null {
  const cleanId = pageId.replace(/-/g, '')
  const pageDir = path.join(CONTENT_DIR, 'pages', cleanId)

  if (!fs.existsSync(pageDir)) return null

  const metaPath = path.join(pageDir, 'meta.json')
  const blocksPath = path.join(pageDir, 'blocks.json')

  if (!fs.existsSync(metaPath) || !fs.existsSync(blocksPath)) return null

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  const blocks = JSON.parse(fs.readFileSync(blocksPath, 'utf-8'))

  // Load database entries
  const databaseEntries: Record<string, DatabaseEntry[]> = {}
  const dbDir = path.join(pageDir, 'databases')
  if (fs.existsSync(dbDir)) {
    const dbFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'))
    for (const dbFile of dbFiles) {
      const dbId = dbFile.replace('.json', '')
      databaseEntries[dbId] = JSON.parse(fs.readFileSync(path.join(dbDir, dbFile), 'utf-8'))
    }
  }

  return { meta, blocks, databaseEntries }
}

export function getAllPages(): DatabaseEntry[] {
  const manifest = getManifest()
  const entries: DatabaseEntry[] = []

  for (const [pageId, pageInfo] of Object.entries(manifest.pages)) {
    if (pageInfo.slugPath.length === 0) continue // skip root
    // `published` and `lastEdited` used to be hardcoded null and '', so every
    // consumer — the sitemap, the feed — believed the site had no dates at
    // all. The manifest does not carry them, but each page's meta.json does.
    const meta = readPageDates(pageId)
    entries.push({
      id: pageId,
      title: pageInfo.title,
      description: pageInfo.description,
      cover: pageInfo.cover,
      icon: pageInfo.icon,
      slug: pageInfo.slugPath[pageInfo.slugPath.length - 1],
      path: pageInfo.slugPath,
      published: meta.published,
      author: null,
      lastEdited: meta.lastEdited,
      order: null,
    })
  }

  return entries
}

// meta.json is small; blocks.json is the bulk of a page and is not read here.
// Cached because getAllPages runs for getStaticPaths, the sitemap and the feed.
const pageDateCache = new Map<string, { published: string | null; lastEdited: string }>()

function readPageDates(pageId: string): { published: string | null; lastEdited: string } {
  const cached = pageDateCache.get(pageId)
  if (cached) return cached

  let dates = { published: null as string | null, lastEdited: '' }
  const metaPath = path.join(CONTENT_DIR, 'pages', pageId, 'meta.json')
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      dates = { published: meta.published ?? null, lastEdited: meta.lastEdited || '' }
    } catch {
      // A malformed meta.json should cost this page its dates, not the build.
    }
  }

  pageDateCache.set(pageId, dates)
  return dates
}
