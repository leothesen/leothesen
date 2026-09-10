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
  // Keyed by URL, because two Notion pages can claim the same one.
  const byPath = new Map<string, DatabaseEntry>()
  const collisions = new Map<string, string[]>()

  // Sorted so the winner of a collision is the same on every build. Iterating
  // manifest.pages directly would leave it to JSON key order, which is stable
  // in practice but not something to depend on for which page a URL serves.
  const pages = Object.entries(manifest.pages).sort(([a], [b]) => a.localeCompare(b))

  for (const [pageId, pageInfo] of pages) {
    if (pageInfo.slugPath.length === 0) continue // skip root

    const path = pageInfo.slugPath.join('/')
    if (byPath.has(path)) {
      collisions.set(path, [...(collisions.get(path) || [byPath.get(path)!.id]), pageId])
      continue
    }

    // `published` and `lastEdited` used to be hardcoded null and '', so every
    // consumer — the sitemap, the feed — believed the site had no dates at
    // all. The manifest does not carry them, but each page's meta.json does.
    // Read after the collision check, so a page that loses one costs no I/O.
    const meta = readPageDates(pageId)

    byPath.set(path, {
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

  warnAboutCollisions(collisions)
  return [...byPath.values()]
}

// Printed once per process rather than once per call — getAllPages runs for
// getStaticPaths, the sitemap, the feed and the search index.
let warnedAboutCollisions = false

function warnAboutCollisions(collisions: Map<string, string[]>) {
  if (warnedAboutCollisions || collisions.size === 0) return
  warnedAboutCollisions = true

  console.warn(
    `\n[content] ${collisions.size} URL${collisions.size === 1 ? '' : 's'} claimed by more than one Notion page.\n` +
      `Only the first is reachable; the rest are unreachable at any URL.\n` +
      `Rename or delete the duplicates in Notion to fix this at the source:\n`
  )
  for (const [path, ids] of collisions) {
    console.warn(`  /${path}`)
    for (const id of ids) console.warn(`      ${id}`)
  }
  console.warn('')
}

/**
 * A page's meta.json, without touching its blocks.
 *
 * getLocalPage also parses blocks.json, which is the bulk of a page's bytes —
 * reading that for all 216 pages just to find a date would be wasteful.
 */
export function getPageMeta(pageId: string): LocalPageData['meta'] | null {
  const metaPath = path.join(CONTENT_DIR, 'pages', pageId.replace(/-/g, ''), 'meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
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

export interface SiteSection {
  title: string
  path: string
}

/**
 * The top level of the slug tree — the site's main sections.
 *
 * Derived from the manifest rather than configured, so it follows whatever is
 * in Notion. site.config.ts does have a navigationLinks option, but it takes
 * hardcoded page ids that drift the moment a page is renamed or moved.
 */
export function getTopLevelSections(): SiteSection[] {
  const manifest = getManifest()
  return Object.entries(manifest.slugTree).map(([slug, node]) => ({
    title: node.title.trim(),
    path: `/${slug}`,
  }))
}
