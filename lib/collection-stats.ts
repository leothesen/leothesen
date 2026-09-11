import * as fs from 'fs'
import * as path from 'path'

import { getManifest } from './notion-local'

const CONTENT_DIR = path.join(process.cwd(), '.content')

export interface CollectionStats {
  /** Pages in this subtree, the page itself included. */
  pages: number
  /** Image blocks across the whole subtree. */
  photos: number
  /** Earliest and latest creation date in the subtree, as ISO strings. */
  from: string | null
  to: string | null
}

interface SlugTreeNode {
  pageId: string
  title: string
  children: Record<string, SlugTreeNode>
}

/**
 * What a link into a collection is actually promising.
 *
 * The gallery on the front page offered eight covers and eight titles, which is
 * the same card whether it leads to a single paragraph or to 112 entries and
 * 614 photographs — and "Sabbatical" is in fact the latter. None of this is new
 * information: the manifest already knows the shape of the tree and the blocks
 * on disk already contain the images. It was simply never counted.
 *
 * Build-time only. Reads the 217 pages once and memoises for the life of the
 * process.
 */
let cache: Map<string, CollectionStats> | null = null

function readPageFacts(cleanId: string): { photos: number; created: string | null } {
  const dir = path.join(CONTENT_DIR, 'pages', cleanId)
  let photos = 0
  let created: string | null = null

  try {
    const blocks = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf-8'))
    const walk = (list: any[]) => {
      for (const block of list || []) {
        if (block?.type === 'image') photos++
        if (block?.children) walk(block.children)
      }
    }
    walk(Array.isArray(blocks) ? blocks : blocks?.blocks)
  } catch {
    // A page the manifest names but that is missing on disk contributes
    // nothing, rather than failing the build.
  }

  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'))
    created = meta?.published || meta?.created || null
  } catch {
    created = null
  }

  return { photos, created }
}

function build(): Map<string, CollectionStats> {
  const manifest = getManifest()
  const stats = new Map<string, CollectionStats>()
  const facts = new Map<string, { photos: number; created: string | null }>()

  const factsFor = (pageId: string) => {
    const cleanId = pageId.replace(/-/g, '')
    if (!facts.has(cleanId)) facts.set(cleanId, readPageFacts(cleanId))
    return facts.get(cleanId)!
  }

  // Post-order: a node's totals are its own plus everything beneath it.
  const visit = (node: SlugTreeNode): CollectionStats => {
    const own = factsFor(node.pageId)
    let pages = 1
    let photos = own.photos
    let from = own.created
    let to = own.created

    for (const child of Object.values(node.children || {})) {
      const childStats = visit(child)
      pages += childStats.pages
      photos += childStats.photos
      if (childStats.from && (!from || childStats.from < from)) from = childStats.from
      if (childStats.to && (!to || childStats.to > to)) to = childStats.to
    }

    const result = { pages, photos, from, to }
    // Keyed both ways: the manifest writes ids without dashes, while the
    // database entry files use the dashed form.
    stats.set(node.pageId, result)
    stats.set(node.pageId.replace(/-/g, ''), result)
    return result
  }

  for (const node of Object.values(manifest.slugTree as Record<string, SlugTreeNode>)) {
    visit(node)
  }

  return stats
}

export function getCollectionStats(pageId: string): CollectionStats | null {
  if (!cache) cache = build()
  return cache.get(pageId) || cache.get(pageId.replace(/-/g, '')) || null
}
