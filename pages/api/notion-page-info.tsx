import { NextApiRequest, NextApiResponse } from 'next'

import * as libConfig from '@/lib/config'
import { getManifest } from '@/lib/notion-local'
import { parsePageId } from '@/lib/notion-utils'
import type { NotionPageInfo } from '@/lib/types'

/**
 * Page metadata for the Open Graph image renderer.
 *
 * Reads the synced manifest rather than calling the Notion API. The API call
 * bought nothing the manifest does not already hold, and cost three things:
 *
 *   - a live round-trip on the cold path, which is most of the ~7s a first
 *     social-image render took (crawlers do time out);
 *   - a runtime NOTION_TOKEN, on a site that otherwise reads everything from
 *     .content;
 *   - an expiring cover URL. getPageCover returned a signed
 *     prod-files-secure.s3 link with X-Amz-Credential on it, while the
 *     manifest holds the permanent Blob URL for the same image. The OG image
 *     is cached immutably for a year, so a render that happened to land after
 *     that signature expired baked a missing background in for good.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'method not allowed' })
  }

  const pageId: string = parsePageId(req.body?.pageId)
  if (!pageId) {
    return res.status(400).json({ error: 'invalid notion page id' })
  }

  const page = getManifest().pages[pageId]
  if (!page) {
    return res.status(404).json({ error: 'unknown notion page id' })
  }

  const icon = page.icon
  // Every page's `published` is null in the manifest, so `detail` always fell
  // through to the author anyway — the date branch this replaces was dead.
  const pageInfo: NotionPageInfo = {
    pageId,
    title: page.title?.trim() || libConfig.name,
    image: page.cover || libConfig.defaultPageCover,
    imageObjectPosition: null,
    author: libConfig.author,
    authorImage: icon && icon.startsWith('http') ? icon : null,
    detail: libConfig.author || libConfig.domain,
  }

  // The manifest only changes on a redeploy, so this can be cached hard.
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800'
  )
  res.status(200).json(pageInfo)
}
