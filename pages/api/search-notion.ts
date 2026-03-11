import { NextApiRequest, NextApiResponse } from 'next'

import { searchNotion, getPageTitle, getPageCover } from '@/lib/notion-api'

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'method not allowed' })
  }

  const { query } = req.body

  const results = await searchNotion(query)
  const mapped = results.map((page) => ({
    id: page.id,
    title: getPageTitle(page),
    cover: getPageCover(page),
  }))

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, max-age=60, stale-while-revalidate=60'
  )
  res.status(200).json(mapped)
}
