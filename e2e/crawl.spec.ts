import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * The whole site over HTTP, against the production server.
 *
 * The unit suite renders every page and checks its links in isolation. This
 * asks the real server, which is where status codes, route resolution and
 * headers actually happen: a link can be correct in the HTML and still 404 if
 * the route that should serve it does not, and a missing page can render the
 * not-found template while answering 200.
 */

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return out
}

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('/sitemap.xml')
  expect(res.status()).toBe(200)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
}

test.describe.configure({ mode: 'serial' })

test('every page in the sitemap answers 200 with its own content', async ({ request }) => {
  test.setTimeout(180_000)
  const paths = await sitemapPaths(request)
  expect(paths.length).toBeGreaterThan(100)

  const failures = (
    await inBatches(paths, 12, async (p) => {
      const res = await request.get(p, { maxRedirects: 0 })
      if (res.status() !== 200) return `${p}: ${res.status()}`
      const html = await res.text()
      if (/<title>Page not found/.test(html)) return `${p}: rendered the not-found page`
      if (!/<h1 class="notion-title">/.test(html)) return `${p}: no page title`
      return null
    })
  ).filter(Boolean)

  expect(failures).toEqual([])
})

test('every internal link on every page resolves', async ({ request }) => {
  test.setTimeout(240_000)
  const pages = await sitemapPaths(request)

  const linkedFrom = new Map<string, string>()
  await inBatches(pages, 12, async (p) => {
    const html = await (await request.get(p)).text()
    for (const [, href] of html.matchAll(/<a[^>]+href="([^"]+)"/g)) {
      if (!href.startsWith('/') || href.startsWith('//')) continue
      const target = href.replace(/&amp;/g, '&').split('#')[0]
      if (target && !linkedFrom.has(target)) linkedFrom.set(target, p)
    }
  })
  expect(linkedFrom.size).toBeGreaterThan(100)

  const dead = (
    await inBatches([...linkedFrom], 12, async ([target, from]) => {
      const res = await request.get(target)
      return res.ok() ? null : `${target} (${res.status()}), linked from ${from}`
    })
  ).filter(Boolean)

  expect(dead).toEqual([])
})

test('an unknown URL is a real 404, with the not-found page and noindex', async ({ request }) => {
  // With `fallback: true` this was a 200 — telling crawlers the URL is real.
  for (const p of ['/this-page-does-not-exist', '/ocean/nope/deeper', '/p/330ca8d550aa4141983499f780a55cb6']) {
    const res = await request.get(p)
    expect(res.status(), p).toBe(404)
    const html = await res.text()
    expect(html).toContain('Page Not Found')
    expect(html).toMatch(/<meta name="robots" content="noindex,follow"/)
  }
})

test('pages carry the security headers', async ({ request }) => {
  for (const p of ['/', (await sitemapPaths(request))[1]]) {
    const headers = (await request.get(p)).headers()
    expect(headers['content-security-policy'], p).toContain("frame-ancestors 'self'")
    expect(headers['x-content-type-options'], p).toBe('nosniff')
    expect(headers['referrer-policy'], p).toBe('strict-origin-when-cross-origin')
  }
})

test('the machine-readable routes serve the right content types', async ({ request }) => {
  const expectations: [string, RegExp][] = [
    ['/feed', /^text\/xml/],
    ['/sitemap.xml', /^text\/xml/],
    ['/robots.txt', /^text\/plain/],
    ['/llms.txt', /^text\/plain/],
    ['/api/search-index', /^application\/json/],
  ]
  for (const [p, type] of expectations) {
    const res = await request.get(p)
    expect(res.status(), p).toBe(200)
    expect(res.headers()['content-type'], p).toMatch(type)
  }

  const search = await request.post('/api/search-notion', { data: { query: 'ocean' } })
  expect(search.status()).toBe(200)
  expect(Array.isArray(await search.json())).toBe(true)
})

test('icons are served as images from every depth, not as HTML', async ({ request }) => {
  // A relative favicon href once made every nested page ask the catch-all
  // route for /section/page/favicon.png, which answered with 4.4KB of HTML.
  const nested = (await sitemapPaths(request)).find((p) => p.split('/').length > 3)!
  const html = await (await request.get(nested)).text()
  const hrefs = [...html.matchAll(/<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1])

  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) {
    expect(href.startsWith('/'), href).toBe(true)
    const res = await request.get(new URL(href, `http://x${nested}`).pathname)
    expect(res.status(), href).toBe(200)
    expect(res.headers()['content-type'], href).toMatch(/^image\//)
  }
})
