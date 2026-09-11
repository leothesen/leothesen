import type { NotionBlock, NotionPage } from './notion-api'

export type NavigationStyle = 'default' | 'custom'

export interface PageError {
  message?: string
  statusCode: number
}

export interface Site {
  name: string
  domain: string
  rootNotionPageId: string
  rootNotionSpaceId: string | null
  description?: string
}

export interface PageProps {
  site?: Site
  page?: NotionPage
  blocks?: NotionBlock[]
  pageId?: string
  error?: PageError
}

export interface DatabasePageProps {
  site?: Site
  page?: NotionPage
  blocks?: NotionBlock[]
  databaseEntries?: DatabaseEntry[]
  pageId?: string
  error?: PageError
}

import type { CollectionStats } from './collection-stats'

export interface DatabaseEntry {
  id: string
  title: string
  description: string | null
  cover: string | null
  icon: string | null
  slug: string
  path: string[]
  published: string | null
  author: string | null
  lastEdited: string
  order: number | null
  /**
   * How much sits behind this card — pages, photographs and the span of dates
   * in the subtree it opens. Attached at build time by
   * resolveNotionPageLocal; absent when the entry is not a page in the tree.
   */
  stats?: CollectionStats | null
}

export interface SiteMap {
  site: Site
  pages: DatabaseEntry[]
}

export interface Breadcrumb {
  title: string
  icon: string | null
  href: string
}

export interface PageUrlOverridesMap {
  [pagePath: string]: string
}

export interface PageUrlOverridesInverseMap {
  [pageId: string]: string
}

export interface NotionPageInfo {
  pageId: string
  title: string
  image: string | null
  imageObjectPosition: string | null
  author: string
  authorImage: string | null
  detail: string
}

/**
 * One page in the client-side search index. Keys are short because the whole
 * index ships to the browser as a single document.
 */
export interface SearchEntry {
  /** Title, as shown in the results list. */
  t: string
  /** Path, used as both the href and part of the haystack. */
  p: string
  /** Description, when the page has one. */
  d?: string
}
