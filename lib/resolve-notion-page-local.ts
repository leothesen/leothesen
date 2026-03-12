import { site, pageUrlOverrides, pageUrlAdditions } from './config'
import { parsePageId } from './notion-utils'
import { getManifest, getLocalPage } from './notion-local'
import type { NotionBlock } from './notion-api'
import type { Breadcrumb, DatabaseEntry } from './types'
import type { ChildPageInfo } from './notion'

interface SlugTreeNode {
  pageId: string
  title: string
  children: Record<string, SlugTreeNode>
}

function findPageBySlugPath(
  segments: string[],
  tree: Record<string, SlugTreeNode>,
): { pageId: string; breadcrumbs: Breadcrumb[] } | null {
  const breadcrumbs: Breadcrumb[] = []
  let currentTree = tree

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const node = currentTree[segment]
    if (!node) return null

    if (i < segments.length - 1) {
      breadcrumbs.push({
        title: node.title,
        icon: null,
        href: '/' + segments.slice(0, i + 1).join('/'),
      })
    }

    if (i === segments.length - 1) {
      return { pageId: node.pageId, breadcrumbs }
    }

    currentTree = node.children
  }

  return null
}

// Flat search: find a slug anywhere in the tree
function findPageBySlugFlat(
  slug: string,
  tree: Record<string, SlugTreeNode>,
): string | null {
  for (const [key, node] of Object.entries(tree)) {
    if (key === slug) return node.pageId
    const found = findPageBySlugFlat(slug, node.children)
    if (found) return found
  }
  return null
}

export async function resolveNotionPageLocal(domain: string, rawPageId?: string | string[]) {
  const manifest = getManifest()
  const segments = Array.isArray(rawPageId) ? rawPageId : rawPageId ? [rawPageId] : []

  let pageId: string | null = null
  let breadcrumbs: Breadcrumb[] = []

  if (segments.length > 0 && segments[0] !== 'index') {
    // Try direct page ID
    if (segments.length === 1) {
      const parsed = parsePageId(segments[0])
      if (parsed && manifest.pages[parsed]) {
        pageId = parsed
      }
      if (!parsed) {
        const override = pageUrlOverrides[segments[0]] || pageUrlAdditions[segments[0]]
        if (override) {
          const overrideId = parsePageId(override)
          if (overrideId && manifest.pages[overrideId]) {
            pageId = overrideId
          }
        }
      }
    }

    // Try walking slug tree
    if (!pageId) {
      const result = findPageBySlugPath(segments, manifest.slugTree)
      if (result) {
        pageId = result.pageId
        breadcrumbs = result.breadcrumbs
      }
    }

    // Flat fallback for single segments
    if (!pageId && segments.length === 1) {
      pageId = findPageBySlugFlat(segments[0], manifest.slugTree)
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

  const localPage = getLocalPage(pageId)
  if (!localPage) {
    return {
      site,
      error: {
        message: `Content not found for page "${pageId}"`,
        statusCode: 404,
      },
    }
  }

  // Build databaseEntriesMap keyed by database ID (UUID format for NotionRenderer)
  const databaseEntriesMap: Record<string, DatabaseEntry[]> | null =
    Object.keys(localPage.databaseEntries).length > 0
      ? buildDatabaseEntriesMapWithUuids(localPage.databaseEntries)
      : null

  // Build child page map from manifest for child_page blocks
  const childPageMap = buildChildPageMap(localPage.blocks, manifest)

  // Rewrite Notion URLs in block rich_text links
  const rewrittenBlocks = rewriteNotionUrlsInBlocks(localPage.blocks, manifest)

  return {
    site,
    pageMeta: localPage.meta,
    blocks: rewrittenBlocks,
    pageId,
    breadcrumbs,
    databaseEntriesMap,
    childPageMap,
  }
}

// The sync script stores database IDs as clean hex, but NotionRenderer looks them up
// by the block.id which is UUID format. Build a map keyed by both formats.
function buildDatabaseEntriesMapWithUuids(
  entries: Record<string, DatabaseEntry[]>
): Record<string, DatabaseEntry[]> {
  const map: Record<string, DatabaseEntry[]> = {}
  for (const [cleanId, dbEntries] of Object.entries(entries)) {
    map[cleanId] = dbEntries
    // Also add UUID-keyed version
    const hex = cleanId.replace(/-/g, '')
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    map[uuid] = dbEntries
  }
  return map
}

// Build a child page map from the manifest so NotionRenderer can link child_page blocks
function buildChildPageMap(
  blocks: NotionBlock[],
  manifest: ReturnType<typeof getManifest>
): Record<string, ChildPageInfo> {
  const map: Record<string, ChildPageInfo> = {}

  function walk(blocks: NotionBlock[]) {
    for (const block of blocks) {
      if (block.type === 'child_page') {
        const cleanId = block.id.replace(/-/g, '')
        const pageInfo = manifest.pages[cleanId]
        if (pageInfo) {
          map[block.id] = {
            icon: pageInfo.icon,
            slug: pageInfo.slugPath.join('/'),
          }
        }
      }
      if ((block as any).children) {
        walk((block as any).children)
      }
    }
  }

  walk(blocks)
  return map
}

// Rewrite notion.so URLs to local slug paths in block rich_text
function rewriteNotionUrlsInBlocks(
  blocks: NotionBlock[],
  manifest: ReturnType<typeof getManifest>
): NotionBlock[] {
  const notionUrlRegex = /https:\/\/(?:www\.)?notion\.so\/(?:[^/]*\/)?(?:[a-zA-Z0-9-]*?)([a-f0-9]{32})/

  function rewriteRichText(richText: any[]): any[] {
    if (!richText) return richText
    return richText.map((item) => {
      if (item.href) {
        const match = item.href.match(notionUrlRegex)
        if (match) {
          const cleanId = match[1]
          const pageInfo = manifest.pages[cleanId]
          if (pageInfo && pageInfo.slugPath.length > 0) {
            return { ...item, href: '/' + pageInfo.slugPath.join('/') }
          }
        }
      }
      if (item.text?.link?.url) {
        const match = item.text.link.url.match(notionUrlRegex)
        if (match) {
          const cleanId = match[1]
          const pageInfo = manifest.pages[cleanId]
          if (pageInfo && pageInfo.slugPath.length > 0) {
            const newUrl = '/' + pageInfo.slugPath.join('/')
            return {
              ...item,
              href: newUrl,
              text: { ...item.text, link: { url: newUrl } },
            }
          }
        }
      }
      return item
    })
  }

  function rewriteBlock(block: any): any {
    const rewritten = { ...block }
    const typeData = rewritten[rewritten.type]

    if (typeData?.rich_text) {
      rewritten[rewritten.type] = {
        ...typeData,
        rich_text: rewriteRichText(typeData.rich_text),
      }
    }
    if (typeData?.caption) {
      rewritten[rewritten.type] = {
        ...rewritten[rewritten.type],
        caption: rewriteRichText(typeData.caption),
      }
    }

    if (rewritten.children) {
      rewritten.children = rewritten.children.map(rewriteBlock)
    }

    return rewritten
  }

  return blocks.map(rewriteBlock)
}
