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
