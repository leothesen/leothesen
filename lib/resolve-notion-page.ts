import { parsePageId, idToUuid, uuidToId } from './notion-utils'
import { pageUrlAdditions, pageUrlOverrides, site } from './config'
import { getPageWithBlocks, getDatabaseEntries, findDatabaseBlocks } from './notion'
import type { DatabaseEntry } from './types'

// Recursively search databases within a page (and its child pages) for a matching slug
async function findPageBySlug(slug: string, pageUuid: string, depth = 0): Promise<string | undefined> {
  if (depth > 3) return undefined // prevent infinite recursion

  const { blocks } = await getPageWithBlocks(pageUuid)
  const dbBlocks = findDatabaseBlocks(blocks)

  for (const dbBlock of dbBlocks) {
    const entries = await getDatabaseEntries(dbBlock.id)
    const entry = entries.find((e) => e.slug === slug)
    if (entry) {
      return uuidToId(entry.id)
    }

    // Search databases inside each entry's page
    for (const e of entries) {
      const found = await findPageBySlug(slug, e.id, depth + 1)
      if (found) return found
    }
  }

  return undefined
}

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
      // Try to find the page by slug in the database (recursively searching nested databases)
      pageId = await findPageBySlug(rawPageId, idToUuid(site.rootNotionPageId))
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
      databaseEntries: databaseEntries ?? null,
    }
  } catch (err) {
    console.error('page error', domain, pageId, err)
    throw err
  }
}
