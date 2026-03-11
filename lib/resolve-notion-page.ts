import { parsePageId, idToUuid, uuidToId, slugify } from './notion-utils'
import { getPageTitle, getPageIcon, getBlocksShallow } from './notion-api'
import { pageUrlAdditions, pageUrlOverrides, site } from './config'
import { getPageWithBlocks, getPageWithShallowBlocks, getPage, getDatabaseEntries, findDatabaseBlocks, getChildPageMap } from './notion'
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

// Collect child_page blocks from shallow blocks, including inside columns
async function collectChildPageBlocksShallow(blocks: import('./notion-api').NotionBlock[]): Promise<import('./notion-api').NotionBlock[]> {
  const childPages = blocks.filter((b) => b.type === 'child_page')

  // Also check inside column_list blocks (need to fetch column children)
  const columnLists = blocks.filter((b) => b.type === 'column_list')
  if (columnLists.length > 0) {
    const columnChildrenArrays = await Promise.all(
      columnLists.map((cl) => getBlocksShallow(cl.id))
    )
    for (const columns of columnChildrenArrays) {
      const columnContentArrays = await Promise.all(
        columns.map((col) => getBlocksShallow(col.id))
      )
      for (const content of columnContentArrays) {
        childPages.push(...content.filter((b) => b.type === 'child_page'))
      }
    }
  }

  return childPages
}

// Fallback: recursively search all nested databases and child pages for a slug
async function findPageBySlug(slug: string, pageUuid: string, depth = 0): Promise<string | undefined> {
  if (depth > 3) return undefined

  const { blocks } = await getPageWithShallowBlocks(pageUuid)

  // Check child_page blocks (including inside columns)
  const childPageBlocks = await collectChildPageBlocksShallow(blocks)
  for (const block of childPageBlocks) {
    const page = await getPage(block.id)
    const title = getPageTitle(page)
    const pageSlug = slugify(title) || uuidToId(block.id)
    if (pageSlug === slug) {
      return uuidToId(block.id)
    }
  }

  // Check databases
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

    // Fetch database entries and child page info in parallel
    const dbBlocks = findDatabaseBlocks(blocks)
    const [dbEntries, childPageMap] = await Promise.all([
      dbBlocks.length > 0
        ? Promise.all(dbBlocks.map((db) => getDatabaseEntries(db.id, segments)))
        : Promise.resolve([]),
      getChildPageMap(blocks),
    ])

    let databaseEntriesMap: Record<string, DatabaseEntry[]> | null = null
    if (dbBlocks.length > 0) {
      databaseEntriesMap = {}
      dbBlocks.forEach((db, i) => {
        databaseEntriesMap![db.id] = dbEntries[i]
      })
    }

    return {
      site,
      page,
      blocks,
      pageId,
      breadcrumbs,
      databaseEntriesMap,
      childPageMap: Object.keys(childPageMap).length > 0 ? childPageMap : null,
    }
  } catch (err) {
    console.error('page error', domain, pageId, err)
    throw err
  }
}
