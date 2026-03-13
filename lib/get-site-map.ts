import * as config from './config'
import { getAllPages } from './notion-local'
import type { SiteMap } from './types'

export async function getSiteMap(): Promise<SiteMap> {
  const pages = getAllPages()

  return {
    site: config.site,
    pages,
  }
}
