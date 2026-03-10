import {
  getBlocks,
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
import type { DatabaseEntry } from './types'

export { getBlocks, getPage }

export async function getPageWithBlocks(pageId: string) {
  const [page, blocks] = await Promise.all([
    getPage(pageId),
    getBlocks(pageId),
  ])
  return { page, blocks }
}

export async function getDatabaseEntries(databaseId: string): Promise<DatabaseEntry[]> {
  const pages = await queryDatabase(databaseId)
  return pages.map(pageToEntry)
}

export function pageToEntry(page: NotionPage): DatabaseEntry {
  const title = getPageTitle(page)
  const id = uuidToId(page.id)
  const slug = slugify(title) || id

  return {
    id: page.id,
    title,
    description: getPagePropertyText(page, 'Description'),
    cover: getPageCover(page),
    icon: getPageIcon(page),
    slug,
    published: getPagePropertyText(page, 'Published'),
    author: getPagePropertyText(page, 'Author'),
    lastEdited: page.last_edited_time,
  }
}

// Find child_database blocks in a page's blocks
export function findDatabaseBlocks(blocks: NotionBlock[]): NotionBlock[] {
  return blocks.filter((b) => b.type === 'child_database')
}
