import { NextApiRequest, NextApiResponse } from 'next'

import { getAllPages } from '@/lib/notion-local'

const MAX_QUERY_LENGTH = 100
const MAX_RESULTS = 20

/**
 * Searches the published site.
 *
 * This used to forward the request body straight to `notion.search()` with the
 * site's integration token, which had three problems:
 *
 *   - It searched the *workspace*, not the site. Anything the integration can
 *     see was reachable, including pages that were never published — an empty
 *     body was enough to list them.
 *   - There was no validation. `{}` and `{"query": ""}` returned a page dump;
 *     a null, a number or an object threw and returned a 500 HTML error page.
 *   - Every call spent Notion API quota on behalf of an anonymous caller.
 *
 * The manifest holds every published page, so the answer is already on disk.
 * Results keep their previous shape and gain `path`, since an id and a title
 * with no URL cannot be linked to.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const raw = req.body?.query
  if (typeof raw !== 'string') {
    return res.status(400).json({ error: 'query must be a string' })
  }

  const query = raw.trim().slice(0, MAX_QUERY_LENGTH).toLowerCase()
  if (query.length < 2) {
    return res.status(400).json({ error: 'query must be at least 2 characters' })
  }

  const results = getAllPages()
    .map((page) => {
      const title = (page.title || '').toLowerCase()
      const path = '/' + page.path.join('/')
      // Cheapest useful ranking: a title match beats a path match, and a
      // prefix beats a match buried in the middle.
      const rank = title.startsWith(query)
        ? 0
        : title.includes(query)
          ? 1
          : path.toLowerCase().includes(query)
            ? 2
            : null
      return rank === null ? null : { page, path, rank }
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.page.title.length - b.page.title.length)
    .slice(0, MAX_RESULTS)
    .map(({ page, path }) => ({
      id: page.id,
      title: page.title,
      cover: page.cover,
      path,
    }))

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, max-age=60, stale-while-revalidate=86400'
  )
  res.status(200).json(results)
}
