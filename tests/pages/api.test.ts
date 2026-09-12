import { describe, expect, it } from 'vitest'

import notionPageInfo from '../../pages/api/notion-page-info'
import searchIndex from '../../pages/api/search-index'
import searchNotion from '../../pages/api/search-notion'
import { getAllPages, getManifest } from '@/lib/notion-local'
import { mockRequest, mockResponse } from '../helpers/http'

/**
 * The API routes read the committed manifest, so these run against the real
 * content. Assertions are about shape and invariants rather than exact titles,
 * which change with every Notion sync.
 */

const pages = getAllPages()

describe('POST /api/search-notion', () => {
  const search = (body: unknown, method = 'POST') => {
    const res = mockResponse()
    searchNotion(mockRequest(method, body), res as any)
    return res
  }

  it('rejects anything but POST', () => {
    expect(search({ query: 'surf' }, 'GET').statusCode).toBe(405)
  })

  it.each([[{}], [{ query: null }], [{ query: 42 }], [{ query: { $ne: '' } }], [undefined]])(
    'answers %j with a 400, not a 500 or a page dump',
    (body) => {
      // The old handler forwarded the body to notion.search: {} listed the
      // whole workspace, and a non-string threw.
      const res = search(body)
      expect(res.statusCode).toBe(400)
      expect(res.payload).toEqual({ error: 'query must be a string' })
    }
  )

  it('requires at least two characters after trimming', () => {
    expect(search({ query: ' a ' }).statusCode).toBe(400)
    expect(search({ query: '' }).statusCode).toBe(400)
  })

  it('only ever returns published pages, with a linkable path', () => {
    const published = new Map(pages.map((p) => ['/' + p.path.join('/'), p.id]))
    const res = search({ query: 'the' })

    expect(res.statusCode).toBe(200)
    expect(res.payload.length).toBeGreaterThan(0)
    for (const result of res.payload) {
      expect(Object.keys(result).sort()).toEqual(['cover', 'id', 'path', 'title'])
      expect(published.get(result.path)).toBe(result.id)
    }
  })

  it('caps results at 20', () => {
    // The biggest section's slug is in every one of its pages' paths.
    const bySection = new Map<string, number>()
    for (const p of pages) bySection.set(p.path[0], (bySection.get(p.path[0]) || 0) + 1)
    const [section, count] = [...bySection].sort((a, b) => b[1] - a[1])[0]
    expect(count).toBeGreaterThan(20)

    const res = search({ query: section })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toHaveLength(20)
  })

  it('ranks a title prefix above a match further in', () => {
    const target = pages.find((p) => p.title.trim().length >= 6)!
    const prefix = target.title.trim().slice(0, 6)
    const results = search({ query: prefix }).payload as { title: string }[]
    const firstNonPrefix = results.findIndex((r) => !r.title.toLowerCase().startsWith(prefix.toLowerCase()))
    const lastPrefix = results.map((r) => r.title.toLowerCase().startsWith(prefix.toLowerCase())).lastIndexOf(true)
    expect(lastPrefix).toBeGreaterThanOrEqual(0)
    if (firstNonPrefix !== -1) expect(lastPrefix).toBeLessThan(firstNonPrefix)
  })

  it('is case-insensitive and truncates absurd queries', () => {
    const lower = search({ query: pages[0].title.slice(0, 4).toLowerCase() }).payload
    const upper = search({ query: pages[0].title.slice(0, 4).toUpperCase() }).payload
    expect(upper).toEqual(lower)
    expect(search({ query: 'x'.repeat(10_000) }).statusCode).toBe(200)
  })

  it('is cacheable at the edge', () => {
    expect(search({ query: 'surf' }).headers['cache-control']).toMatch(/s-maxage=\d+/)
  })
})

describe('GET /api/search-index', () => {
  const fetchIndex = (method = 'GET') => {
    const res = mockResponse()
    searchIndex(mockRequest(method), res as any)
    return res
  }

  it('rejects anything but GET', () => {
    expect(fetchIndex('POST').statusCode).toBe(405)
  })

  it('lists every published page exactly once, in a stable order', () => {
    const { payload } = fetchIndex()
    const paths = payload.map((e: any) => e.p)

    expect(paths).toHaveLength(pages.length)
    expect(new Set(paths).size).toBe(paths.length)
    expect([...paths].sort((a, b) => a.localeCompare(b))).toEqual(paths)
  })

  it('uses the short keys the client expects, and omits empty descriptions', () => {
    for (const entry of fetchIndex().payload) {
      expect(typeof entry.t).toBe('string')
      expect(entry.p).toMatch(/^\/[a-z0-9-/]+$/)
      if ('d' in entry) expect(entry.d).toBeTruthy()
      expect(Object.keys(entry).every((k) => ['t', 'p', 'd'].includes(k))).toBe(true)
    }
  })

  it('stays small enough to ship to the browser in one go', () => {
    expect(JSON.stringify(fetchIndex().payload).length).toBeLessThan(100_000)
  })
})

describe('POST /api/notion-page-info', () => {
  const info = (body: unknown, method = 'POST') => {
    const res = mockResponse()
    notionPageInfo(mockRequest(method, body), res as any)
    return res
  }
  const manifest = getManifest()

  it('rejects anything but POST, then validates the id', () => {
    expect(info({ pageId: pages[0].id }, 'GET').statusCode).toBe(405)
    expect(info({ pageId: 'not-an-id' }).statusCode).toBe(400)
    expect(info({}).statusCode).toBe(400)
  })

  it('404s a well-formed id that is not published', () => {
    expect(info({ pageId: 'ffffffffffffffffffffffffffffffff' }).statusCode).toBe(404)
  })

  it('describes a page from the manifest, never with an expiring image URL', () => {
    const [id, page] = Object.entries(manifest.pages).find(([, p]) => p.cover && !/X-Amz/.test(p.cover))!
    const res = info({ pageId: id })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual({
      pageId: id,
      title: page.title.trim(),
      image: page.cover,
      imageObjectPosition: null,
      author: 'Leo Thesen',
      authorImage: page.icon?.startsWith('http') ? page.icon : null,
      detail: 'Leo Thesen',
    })
  })

  it('accepts the dashed uuid form', () => {
    const id = pages[0].id
    const dashed = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    expect(info({ pageId: dashed }).payload.pageId).toBe(id)
  })

  it('never passes an emoji icon off as an author image', () => {
    const [id] = Object.entries(manifest.pages).find(([, p]) => p.icon && !p.icon.startsWith('http'))!
    expect(info({ pageId: id }).payload.authorImage).toBeNull()
  })
})
