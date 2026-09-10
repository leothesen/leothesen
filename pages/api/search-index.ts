import type { NextApiRequest, NextApiResponse } from 'next'

import { getAllPages } from '@/lib/notion-local'
import type { SearchEntry } from '@/lib/types'

/**
 * The whole site as a searchable list.
 *
 * Deliberately not built on /api/search-notion: that calls the Notion API live,
 * so it needs a runtime token and a round-trip per keystroke, and it returns
 * `{ id, title, cover }` with no path — the results cannot be linked to
 * without resolving every id against the manifest anyway. The manifest is
 * already on disk and already has titles and slugs for all 216 pages, so the
 * index is a few tens of kilobytes the client fetches once.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const entries: SearchEntry[] = getAllPages()
    .filter((page) => page.path?.length)
    .map((page) => {
      const entry: SearchEntry = { t: page.title, p: '/' + page.path.join('/') }
      if (page.description) entry.d = page.description
      return entry
    })
    // Stable order so the payload is byte-identical between builds and stays
    // cacheable, and so equally-ranked matches do not shuffle around.
    .sort((a, b) => a.p.localeCompare(b.p))

  res.setHeader(
    'Cache-Control',
    'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800'
  )
  res.status(200).json(entries)
}
