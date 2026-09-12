// @vitest-environment jsdom
// jsdom only for DOMParser, to prove the XML documents actually parse.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getServerSideProps as feedProps } from '../../pages/feed'
import { getServerSideProps as llmsProps } from '../../pages/llms.txt'
import { getServerSideProps as robotsProps } from '../../pages/robots.txt'
import { getServerSideProps as sitemapProps } from '../../pages/sitemap.xml'
import { getAllPages, getManifest } from '@/lib/notion-local'
import { gssp, mockRequest, mockResponse } from '../helpers/http'

const pages = getAllPages()
const HOST = 'https://leothesen.com'

async function serve(handler: (ctx: any) => Promise<unknown>, method = 'GET') {
  const res = mockResponse()
  await handler(gssp(mockRequest(method), res))
  return res
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.querySelector('parsererror')?.textContent ?? null).toBeNull()
  return doc
}

afterEach(() => vi.unstubAllEnvs())

describe.each([
  ['/sitemap.xml', sitemapProps],
  ['/feed', feedProps],
  ['/robots.txt', robotsProps],
  ['/llms.txt', llmsProps],
])('%s', (_, handler) => {
  it('rejects anything but GET', async () => {
    const res = await serve(handler as any, 'POST')
    expect(res.statusCode).toBe(405)
    expect(res.ended).toBe(true)
  })
})

describe('/sitemap.xml', () => {
  it('is well-formed XML listing the home page and every published page once', async () => {
    const res = await serve(sitemapProps as any)
    expect(res.headers['content-type']).toBe('text/xml')

    const locs = [...parseXml(res.body).getElementsByTagName('loc')].map((l) => l.textContent)
    expect(locs[0]).toBe(`${HOST}/`)
    expect(locs).toHaveLength(pages.length + 1)
    expect(new Set(locs).size).toBe(locs.length)
    expect(locs.slice(1).sort()).toEqual(pages.map((p) => `${HOST}/${p.path.join('/')}`).sort())
  })

  it('gives lastmod as a real W3C date, or not at all', async () => {
    const doc = parseXml((await serve(sitemapProps as any)).body)
    const lastmods = [...doc.getElementsByTagName('lastmod')].map((l) => l.textContent!)
    expect(lastmods.length).toBeGreaterThan(0)
    for (const value of lastmods) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(new Date(value).getTime())).toBe(false)
    }
  })
})

describe('/feed', () => {
  it('is a valid RSS document whose self-link is this route', async () => {
    const res = await serve(feedProps as any)
    expect(res.headers['content-type']).toBe('text/xml; charset=utf-8')
    const doc = parseXml(res.body)

    expect(doc.querySelector('channel > title')!.textContent).toBe('Leo Thesen')
    // It used to advertise /feed.xml, which nothing serves.
    const self = doc.getElementsByTagName('atom:link')[0]
    expect(self.getAttribute('href')).toBe(`${HOST}/feed`)
  })

  it('carries at most 50 items, dated and newest first', async () => {
    const items = [...parseXml((await serve(feedProps as any)).body).querySelectorAll('item')]
    expect(items.length).toBe(Math.min(50, pages.length))

    const dates = items.map((item) => new Date(item.querySelector('pubDate')!.textContent!).getTime())
    expect(dates.every((d) => !Number.isNaN(d))).toBe(true)
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })

  it('links every item to a published page on the real domain', async () => {
    const published = new Set(pages.map((p) => `${HOST}/${p.path.join('/')}`))
    for (const item of parseXml((await serve(feedProps as any)).body).querySelectorAll('item')) {
      expect(published.has(item.querySelector('link')!.textContent!)).toBe(true)
    }
  })
})

describe('/robots.txt', () => {
  it('lets crawlers in on production, pointing at the sitemap', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { body } = await serve(robotsProps as any)
    expect(body).toContain('Allow: /\n')
    expect(body).toContain('Disallow: /api/')
    expect(body).toContain(`Sitemap: ${HOST}/sitemap.xml`)
  })

  it.each(['preview', 'development', undefined])('keeps crawlers out of %s deployments', async (env) => {
    // A preview deployment indexed by Google competes with the real site.
    vi.stubEnv('VERCEL_ENV', env as any)
    const { body } = await serve(robotsProps as any)
    expect(body).toContain('Disallow: /\n')
    expect(body).not.toContain('Allow: /\n')
  })
})

describe('/llms.txt', () => {
  it('follows the llmstxt.org shape: H1, summary, sections of links', async () => {
    const res = await serve(llmsProps as any)
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    const lines = res.body.split('\n')

    expect(lines[0]).toBe('# Leo Thesen')
    expect(lines[2]).toMatch(/^> /)

    const sections = lines.filter((l: string) => l.startsWith('## ')).map((l: string) => l.slice(3))
    const manifest = getManifest()
    expect(sections).toEqual([...Object.values(manifest.slugTree).map((n) => n.title.trim()), 'Feeds'])
  })

  it('links every page in the slug tree, and nothing else on this domain', async () => {
    const { body } = await serve(llmsProps as any)
    const linked = new Set([...body.matchAll(/\]\((https:\/\/leothesen\.com[^)]*)\)/g)].map((m) => m[1]))
    const expected = new Set([
      ...pages.map((p) => `${HOST}/${p.path.join('/')}`),
      `${HOST}/feed`,
      `${HOST}/sitemap.xml`,
    ])
    expect([...linked].filter((url) => !expected.has(url))).toEqual([])
    // Collision losers share a URL, so the slug tree can be one or two short of
    // the page list — but never more than the known duplicates.
    expect(linked.size).toBeGreaterThanOrEqual(expected.size - 3)
  })
})
