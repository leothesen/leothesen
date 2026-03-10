import { parsePageId, idToUuid, uuidToId } from './notion-utils'
import { pageUrlAdditions, pageUrlOverrides, site } from './config'
import { getPageWithBlocks, getDatabaseEntries, findDatabaseBlocks } from './notion'
import type { DatabaseEntry } from './types'

export async function resolveNotionPage(domain: string, rawPageId?: string) {
  let pageId: string

  if (rawPageId && rawPageId !== 'index') {
    pageId = parsePageId(rawPageId)

    if (!pageId) {
      // check if the site configuration provides an override
      const override = pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]
      if (override) {
        pageId = parsePageId(override)
      }
    }

    if (!pageId) {
      // Try to find the page by slug in the database
      const rootData = await getPageWithBlocks(idToUuid(site.rootNotionPageId))
      const dbBlocks = findDatabaseBlocks(rootData.blocks)

      for (const dbBlock of dbBlocks) {
        const entries = await getDatabaseEntries(dbBlock.id)
        const entry = entries.find((e) => e.slug === rawPageId)
        if (entry) {
          pageId = uuidToId(entry.id)
          break
        }
      }
    }

    if (!pageId) {
      return {
        site,
        error: {
          message: `Not found "${rawPageId}"`,
          statusCode: 404,
        },
      }
    }
  } else {
    pageId = site.rootNotionPageId
  }

  try {
    const uuid = idToUuid(pageId)
    const { page, blocks } = await getPageWithBlocks(uuid)

    // Check if this page has databases (e.g., root page with blog posts)
    let databaseEntries: DatabaseEntry[] | undefined
    const dbBlocks = findDatabaseBlocks(blocks)
    if (dbBlocks.length > 0) {
      const allEntries = await Promise.all(
        dbBlocks.map((db) => getDatabaseEntries(db.id))
      )
      databaseEntries = allEntries.flat()
    }

    return {
      site,
      page,
      blocks,
      pageId,
      databaseEntries,
    }
  } catch (err) {
    console.error('page error', domain, pageId, err)
    throw err
  }
}
