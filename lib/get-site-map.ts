import * as config from './config'
import { idToUuid } from './notion-utils'
import { getPageWithBlocks, getDatabaseEntries, findDatabaseBlocks } from './notion'
import type { SiteMap } from './types'

export async function getSiteMap(): Promise<SiteMap> {
  const rootUuid = idToUuid(config.rootNotionPageId)
  const { blocks } = await getPageWithBlocks(rootUuid)
  const dbBlocks = findDatabaseBlocks(blocks)

  let pages = []
  for (const db of dbBlocks) {
    const entries = await getDatabaseEntries(db.id)
    pages.push(...entries)
  }

  return {
    site: config.site,
    pages,
  }
}
