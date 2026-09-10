import type { GetServerSideProps } from 'next'

import RSS from 'rss'

import * as config from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { getPageMeta } from '@/lib/notion-local'

// A feed is a list of what is new, not a copy of the site. All 215 pages went
// out on every fetch; the most recently edited are the ones worth carrying.
const MAX_FEED_ITEMS = 50

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({ error: 'method not allowed' }))
    res.end()
    return { props: {} }
  }

  const siteMap = await getSiteMap()
  const ttlMinutes = 24 * 60
  const ttlSeconds = ttlMinutes * 60

  const feed = new RSS({
    title: config.name,
    site_url: config.host,
    // This route is /feed. It advertised /feed.xml, which no page serves — so
    // the self-link resolved to the not-found page, and validators flag it.
    feed_url: `${config.host}/feed`,
    language: config.language,
    ttl: ttlMinutes,
  })

  // Every page carries a lastEdited in its meta.json, and none has a published
  // date, so lastEdited is the only date this site actually has. Without it
  // every item shipped undated: readers cannot order them and nothing is ever
  // "new", which is most of what a feed is for.
  const dated = siteMap.pages
    .map((page) => {
      const meta = getPageMeta(page.id)
      const iso = meta?.published || meta?.lastEdited
      const date = iso ? new Date(iso) : undefined
      return {
        page,
        date: date && !Number.isNaN(date.getTime()) ? date : undefined,
        description: page.description || meta?.description || '',
      }
    })
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, MAX_FEED_ITEMS)

  for (const { page, date, description } of dated) {
    feed.item({
      title: page.title,
      url: `${config.host}/${page.path.join('/')}`,
      date,
      description,
    })
  }

  const feedText = feed.xml({ indent: true })

  res.setHeader(
    'Cache-Control',
    `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`
  )
  res.setHeader('Content-Type', 'text/xml; charset=utf-8')
  res.write(feedText)
  res.end()

  return { props: {} }
}

export default () => null
