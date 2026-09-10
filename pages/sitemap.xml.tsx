import type { GetServerSideProps } from 'next'

import { host } from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import type { SiteMap } from '@/lib/types'

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({ error: 'method not allowed' }))
    res.end()
    return { props: {} }
  }

  const siteMap = await getSiteMap()

  res.setHeader(
    'Cache-Control',
    'public, max-age=28800, stale-while-revalidate=28800'
  )
  res.setHeader('Content-Type', 'text/xml')
  res.write(createSitemap(siteMap))
  res.end()

  return { props: {} }
}

/** Sitemaps take W3C dates; YYYY-MM-DD is the accepted short form. */
function toW3CDate(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

const createSitemap = (siteMap: SiteMap) =>
  `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${host}/</loc>
    </url>

    ${siteMap.pages
      .map((page) => {
        // lastmod tells a crawler which pages are worth revisiting. Emitted
        // only when the date is real — an invented one is worse than none.
        const lastmod = toW3CDate(page.lastEdited)
        return `
          <url>
            <loc>${host}/${page.path.join('/')}</loc>${lastmod ? `
            <lastmod>${lastmod}</lastmod>` : ''}
          </url>
        `.trim()
      })
      .join('')}
  </urlset>
`

export default () => null
