import * as config from './config'
import { idToUuid } from './notion-utils'
import { getPageWithBlocks, getDatabaseEntries, findDatabaseBlocks } from './notion'
import type { DatabaseEntry, SiteMap } from './types'

// Recursively collect all database entries from a page and its nested pages
async function collectAllEntries(pageUuid: string, depth = 0): Promise<DatabaseEntry[]> {
  if (depth > 3) return []

  const { blocks } = await getPageWithBlocks(pageUuid)
  const dbBlocks = findDatabaseBlocks(blocks)
  const pages: DatabaseEntry[] = []

  for (const db of dbBlocks) {
    const entries = await getDatabaseEntries(db.id)
    pages.push(...entries)

    // Recurse into each entry's page to find nested databases
    for (const entry of entries) {
      const nested = await collectAllEntries(entry.id, depth + 1)
      pages.push(...nested)
    }
  }

  return pages
}

export async function getSiteMap(): Promise<SiteMap> {
  const rootUuid = idToUuid(config.rootNotionPageId)
  const pages = await collectAllEntries(rootUuid)

  return {
    site: config.site,
    pages,
  }
}
