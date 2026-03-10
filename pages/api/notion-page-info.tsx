import { NextApiRequest, NextApiResponse } from 'next'

import * as libConfig from '@/lib/config'
import { getPage, getPageTitle, getPagePropertyText, getPageCover, getPageIcon } from '@/lib/notion-api'
import { parsePageId, idToUuid } from '@/lib/notion-utils'
import type { NotionPageInfo } from '@/lib/types'

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'method not allowed' })
  }

  const pageId: string = parsePageId(req.body.pageId)
  if (!pageId) {
    throw new Error('Invalid notion page id')
  }

  const page = await getPage(idToUuid(pageId))

  const title = getPageTitle(page) || libConfig.name
  const image = getPageCover(page) || libConfig.defaultPageCover
  const icon = getPageIcon(page)
  const author = getPagePropertyText(page, 'Author') || libConfig.author

  const publishedTime = getPagePropertyText(page, 'Published')
  const datePublished = publishedTime ? new Date(publishedTime) : undefined
  const date = datePublished
    ? `${datePublished.toLocaleString('en-US', { month: 'long' })} ${datePublished.getFullYear()}`
    : undefined
  const detail = date || author || libConfig.domain

  const pageInfo: NotionPageInfo = {
    pageId,
    title,
    image,
    imageObjectPosition: null,
    author,
    authorImage: icon && icon.startsWith('http') ? icon : null,
    detail,
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, max-age=3600, stale-while-revalidate=3600'
  )
  res.status(200).json(pageInfo)
}
