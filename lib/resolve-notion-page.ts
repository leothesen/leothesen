import { parsePageId, idToUuid, uuidToId } from './notion-utils'
import { getPageTitle, getPageIcon } from './notion-api'
import { pageUrlAdditions, pageUrlOverrides, site } from './config'
import { getPageWithBlocks, getPageWithShallowBlocks, getDatabaseEntries, findDatabaseBlocks } from './notion'
import type { Breadcrumb, DatabaseEntry } from './types'

interface ResolveResult {
  pageId: string
  breadcrumbs: Breadcrumb[]
}

// Walk path segments through nested databases, collecting breadcrumbs along the way
async function resolvePathSegments(segments: string[], pageUuid: string): Promise<ResolveResult | undefined> {
  let currentPageUuid = pageUuid
  const breadcrumbs: Breadcrumb[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const { blocks, page } = await getPageWithShallowBlocks(currentPageUuid)
    const dbBlocks = findDatabaseBlocks(blocks)

    // Add the current page as a breadcrumb (skip root for first iteration — it's always shown)
    if (i > 0) {
      breadcrumbs.push({
        title: getPageTitle(page),
        icon: getPageIcon(page) ?? null,
        href: '/' + segments.slice(0, i).join('/'),
      })
    }

    // Fetch all database entries in parallel
    const allEntries = await Promise.all(dbBlocks.map((db) => getDatabaseEntries(db.id)))

    let found = false
    for (const entries of allEntries) {
      const entry = entries.find((e) => e.slug === segment)
      if (entry) {
        currentPageUuid = entry.id
        found = true
        break
      }
    }

    if (!found) return undefined
  }

  return {
    pageId: uuidToId(currentPageUuid),
    breadcrumbs,
  }
}

// Fallback: recursively search all nested databases for a slug (for flat URLs)
async function findPageBySlug(slug: string, pageUuid: string, depth = 0): Promise<string | undefined> {
  if (depth > 3) return undefined

  const { blocks } = await getPageWithShallowBlocks(pageUuid)
  const dbBlocks = findDatabaseBlocks(blocks)

  for (const dbBlock of dbBlocks) {
    const entries = await getDatabaseEntries(dbBlock.id)
    const entry = entries.find((e) => e.slug === slug)
    if (entry) {
      return uuidToId(entry.id)
    }

    for (const e of entries) {
      const found = await findPageBySlug(slug, e.id, depth + 1)
      if (found) return found
    }
  }

  return undefined
}

export async function resolveNotionPage(domain: string, rawPageId?: string | string[]) {
  let pageId: string
  let breadcrumbs: Breadcrumb[] = []

  // Normalize to array of path segments
  const segments = Array.isArray(rawPageId) ? rawPageId : rawPageId ? [rawPageId] : []

  if (segments.length > 0 && segments[0] !== 'index') {
    // First, try parsing as a direct Notion page ID (single segment only)
    if (segments.length === 1) {
      pageId = parsePageId(segments[0])

      if (!pageId) {
        const override = pageUrlOverrides[segments[0]] || pageUrlAdditions[segments[0]]
        if (override) {
          pageId = parsePageId(override)
        }
      }
    }

    if (!pageId) {
      // Try walking the path segments through nested databases
      const result = await resolvePathSegments(segments, idToUuid(site.rootNotionPageId))
      if (result) {
        pageId = result.pageId
        breadcrumbs = result.breadcrumbs
      }
    }

    if (!pageId && segments.length === 1) {
      // Fallback: deep search for flat URLs (backwards compatibility)
      pageId = await findPageBySlug(segments[0], idToUuid(site.rootNotionPageId))
    }

    if (!pageId) {
      return {
        site,
        error: {
          message: `Not found "${segments.join('/')}"`,
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
        dbBlocks.map((db) => getDatabaseEntries(db.id, segments))
      )
      databaseEntries = allEntries.flat()
    }

    return {
      site,
      page,
      blocks,
      pageId,
      breadcrumbs,
      databaseEntries: databaseEntries ?? null,
    }
  } catch (err) {
    console.error('page error', domain, pageId, err)
    throw err
  }
}
