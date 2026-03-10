/**
 * Site-wide app configuration.
 *
 * This file pulls from the root "site.config.ts" as well as environment variables.
 */

import { getEnv, getSiteConfig } from './get-config-value'
import { NavigationLink } from './site-config'
import { NavigationStyle, PageUrlOverridesMap, PageUrlOverridesInverseMap, Site } from './types'
import { parsePageId } from './notion-utils'

export const rootNotionPageId: string = parsePageId(
  getSiteConfig('rootNotionPageId'),
  { uuid: false }
)

if (!rootNotionPageId) {
  throw new Error('Config error invalid "rootNotionPageId"')
}

export const rootNotionSpaceId: string | null = parsePageId(
  getSiteConfig('rootNotionSpaceId', null),
  { uuid: true }
)

export const pageUrlOverrides = cleanPageUrlMap(
  getSiteConfig('pageUrlOverrides', {}) || {},
  { label: 'pageUrlOverrides' }
)

export const pageUrlAdditions = cleanPageUrlMap(
  getSiteConfig('pageUrlAdditions', {}) || {},
  { label: 'pageUrlAdditions' }
)

export const inversePageUrlOverrides = invertPageUrlOverrides(pageUrlOverrides)

export const environment = process.env.NODE_ENV || 'development'
export const isDev = environment === 'development'

// general site config
export const name: string = getSiteConfig('name')
export const author: string = getSiteConfig('author')
export const domain: string = getSiteConfig('domain')
export const description: string = getSiteConfig('description', 'Notion Blog')
export const language: string = getSiteConfig('language', 'en')

// social accounts
export const twitter: string | null = getSiteConfig('twitter', null)
export const mastodon: string | null = getSiteConfig('mastodon', null)
export const github: string | null = getSiteConfig('github', null)
export const youtube: string | null = getSiteConfig('youtube', null)
export const linkedin: string | null = getSiteConfig('linkedin', null)
export const newsletter: string | null = getSiteConfig('newsletter', null)
export const zhihu: string | null = getSiteConfig('zhihu', null)

export const getMastodonHandle = (): string | null => {
  if (!mastodon) return null
  const url = new URL(mastodon)
  return `${url.pathname.slice(1)}@${url.hostname}`
}

export const defaultPageIcon: string | null = getSiteConfig('defaultPageIcon', null)
export const defaultPageCover: string | null = getSiteConfig('defaultPageCover', null)
export const defaultPageCoverPosition: number = getSiteConfig('defaultPageCoverPosition', 0.5)

export const includeNotionIdInUrls: boolean = getSiteConfig('includeNotionIdInUrls', !!isDev)

export const navigationStyle: NavigationStyle = getSiteConfig('navigationStyle', 'default')
export const navigationLinks: Array<NavigationLink | null> = getSiteConfig('navigationLinks', null)

export const isSearchEnabled: boolean = getSiteConfig('isSearchEnabled', true)

// ----------------------------------------------------------------------------

export const isServer = typeof window === 'undefined'

export const port = getEnv('PORT', '3000')
export const host = isDev ? `http://localhost:${port}` : `https://${domain}`
export const apiHost = isDev ? host : `https://${process.env.VERCEL_URL || domain}`

export const apiBaseUrl = `/api`
export const api = {
  searchNotion: `${apiBaseUrl}/search-notion`,
  getNotionPageInfo: `${apiBaseUrl}/notion-page-info`,
  getSocialImage: `${apiBaseUrl}/social-image`,
}

// ----------------------------------------------------------------------------

export const site: Site = {
  domain,
  name,
  rootNotionPageId,
  rootNotionSpaceId,
  description,
}

export const posthogId = process.env.NEXT_PUBLIC_POSTHOG_ID

// ----------------------------------------------------------------------------

function cleanPageUrlMap(
  pageUrlMap: PageUrlOverridesMap,
  { label }: { label: string }
): PageUrlOverridesMap {
  return Object.keys(pageUrlMap).reduce((acc, uri) => {
    const pageId = pageUrlMap[uri]
    const uuid = parsePageId(pageId, { uuid: false })

    if (!uuid) throw new Error(`Invalid ${label} page id "${pageId}"`)
    if (!uri) throw new Error(`Missing ${label} value for page "${pageId}"`)
    if (!uri.startsWith('/')) {
      throw new Error(`Invalid ${label} value for page "${pageId}": value "${uri}" should start with "/"`)
    }

    return { ...acc, [uri.slice(1)]: uuid }
  }, {})
}

function invertPageUrlOverrides(overrides: PageUrlOverridesMap): PageUrlOverridesInverseMap {
  return Object.keys(overrides).reduce((acc, uri) => {
    return { ...acc, [overrides[uri]]: uri }
  }, {})
}
