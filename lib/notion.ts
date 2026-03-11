import {
  getBlocks,
  getBlocksShallow,
  getPage,
  getPageCover,
  getPageIcon,
  getPagePropertyText,
  getPageTitle,
  queryDatabase,
  type NotionBlock,
  type NotionPage,
} from './notion-api'
import { slugify, uuidToId } from './notion-utils'

function getPagePropertyNumber(page: NotionPage, name: string): number | null {
  const prop = page.properties[name]
  if (prop?.type === 'number') return prop.number
  return null
}
import type { DatabaseEntry } from './types'

export { getBlocks, getPage }

export async function getPageWithBlocks(pageId: string) {
  const [page, blocks] = await Promise.all([
    getPage(pageId),
    getBlocks(pageId),
  ])
  return { page, blocks }
}

export async function getPageWithShallowBlocks(pageId: string) {
  const [page, blocks] = await Promise.all([
    getPage(pageId),
    getBlocksShallow(pageId),
  ])
  return { page, blocks }
}

export async function getDatabaseEntries(databaseId: string, parentPath: string[] = []): Promise<DatabaseEntry[]> {
  let pages: NotionPage[]
  try {
    pages = await queryDatabase(databaseId, [{ property: 'Order', direction: 'ascending' }])
  } catch (err: any) {
    if (err?.code === 'validation_error' && err?.message?.includes('sort property')) {
      // Database doesn't have an "Order" property — query without sort
      try {
        pages = await queryDatabase(databaseId)
      } catch {
        return []
      }
    } else {
      // Database inaccessible or other error
      return []
    }
  }
  return pages.map((page) => pageToEntry(page, parentPath))
}

export function pageToEntry(page: NotionPage, parentPath: string[] = []): DatabaseEntry {
  const title = getPageTitle(page)
  const id = uuidToId(page.id)
  const slug = slugify(title) || id

  return {
    id: page.id,
    title,
    description: getPagePropertyText(page, 'Description') ?? null,
    cover: getPageCover(page) ?? null,
    icon: getPageIcon(page) ?? null,
    slug,
    path: [...parentPath, slug],
    published: getPagePropertyText(page, 'Published') ?? null,
    author: getPagePropertyText(page, 'Author') ?? null,
    lastEdited: page.last_edited_time,
    order: getPagePropertyNumber(page, 'Order'),
  }
}

// Find child_database blocks in a page's blocks
export function findDatabaseBlocks(blocks: NotionBlock[]): NotionBlock[] {
  return blocks.filter((b) => b.type === 'child_database')
}

// Find all child_page blocks (including nested in columns, etc.)
function collectChildPageBlocks(blocks: NotionBlock[]): NotionBlock[] {
  const result: NotionBlock[] = []
  for (const block of blocks) {
    if (block.type === 'child_page') {
      result.push(block)
    }
    if (block.children) {
      result.push(...collectChildPageBlocks(block.children))
    }
  }
  return result
}

export interface ChildPageInfo {
  icon: string | null
  slug: string
}

export async function getChildPageMap(blocks: NotionBlock[]): Promise<Record<string, ChildPageInfo>> {
  const childPageBlocks = collectChildPageBlocks(blocks)
  if (childPageBlocks.length === 0) return {}

  const pages = await Promise.all(
    childPageBlocks.map((b) => getPage(b.id))
  )

  const map: Record<string, ChildPageInfo> = {}
  pages.forEach((page, i) => {
    const title = getPageTitle(page)
    map[childPageBlocks[i].id] = {
      icon: getPageIcon(page),
      slug: slugify(title) || uuidToId(page.id),
    }
  })
  return map
}
