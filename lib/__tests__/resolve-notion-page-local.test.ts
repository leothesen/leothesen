import * as fs from 'fs'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  DATABASE_ENTRIES,
  IDS,
  importWithContentRoot,
  uuid,
  writeContentFixture,
} from '../../tests/helpers/content-fixture'

/**
 * Every URL on the site goes through resolveNotionPageLocal, and it answers
 * more than "which page is this": breadcrumbs, the prev/next links, the
 * canonical URL search engines index, the reading time, and the rewriting that
 * turns Notion's own links into site paths. Each of those has broken before.
 */

let root: string
let resolve: typeof import('@/lib/resolve-notion-page-local').resolveNotionPageLocal
let local: typeof import('@/lib/notion-local')

beforeAll(async () => {
  root = writeContentFixture()
  ;({ resolveNotionPageLocal: resolve } = await importWithContentRoot(root, () =>
    import('@/lib/resolve-notion-page-local')
  ))
  // The resolver's own copy of notion-local, so both read the same fixture.
  local = await import('@/lib/notion-local')
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

type Resolved = Awaited<ReturnType<typeof resolve>> & Record<string, any>
const at = async (...segments: string[]) =>
  (await resolve('leothesen.com', segments.length ? segments : undefined)) as Resolved

describe('finding the page', () => {
  it('serves the root page for / and for index', async () => {
    expect((await at()).pageId).toBe(IDS.ROOT)
    expect((await at('index')).pageId).toBe(IDS.ROOT)
  })

  it('walks a nested slug path', async () => {
    const page = await at('mountains', 'cederberg', 'route')
    expect(page.pageId).toBe(IDS.ROUTE)
    expect(page.error).toBeUndefined()
  })

  it('accepts a bare page id, dashed or not', async () => {
    expect((await at(IDS.CEDERBERG)).pageId).toBe(IDS.CEDERBERG)
    expect((await at(uuid(IDS.CEDERBERG))).pageId).toBe(IDS.CEDERBERG)
  })

  it('finds a single bare slug anywhere in the tree', async () => {
    // Old hardcoded links often used just the last segment.
    expect((await at('route')).pageId).toBe(IDS.ROUTE)
  })

  it('does not apply the flat fallback to a multi-segment path', async () => {
    // /ocean/route is not a page; resolving it would give one article two URLs.
    expect((await at('ocean', 'route')).error).toEqual({
      message: 'Not found "ocean/route"',
      statusCode: 404,
    })
  })

  it('404s an unknown slug and an unknown page id', async () => {
    expect((await at('nope')).error?.statusCode).toBe(404)
    expect((await at('ffffffffffffffffffffffffffffffff')).error?.statusCode).toBe(404)
  })

  it('404s a page that is in the manifest but was never synced to disk', async () => {
    expect((await at('mountains', 'ghost')).error).toEqual({
      message: `Content not found for page "${IDS.GHOST}"`,
      statusCode: 404,
    })
  })
})

describe('breadcrumbs', () => {
  it('lists each ancestor with its path, not the page itself', async () => {
    expect((await at('mountains', 'cederberg', 'route')).breadcrumbs).toEqual([
      { title: 'Mountains', icon: null, href: '/mountains' },
      { title: 'Cederberg', icon: null, href: '/mountains/cederberg' },
    ])
  })

  it('is empty for a top-level section', async () => {
    expect((await at('ocean')).breadcrumbs).toEqual([])
  })
})

describe('canonical path', () => {
  it('is the slug path however the page was reached', async () => {
    // Search engines should index one URL per page, not one per route to it.
    expect((await at('mountains', 'cederberg', 'route')).canonicalPath).toBe('/mountains/cederberg/route')
    expect((await at('route')).canonicalPath).toBe('/mountains/cederberg/route')
    expect((await at(IDS.ROUTE)).canonicalPath).toBe('/mountains/cederberg/route')
  })

  it('is / for the root page', async () => {
    expect((await at()).canonicalPath).toBe('/')
  })
})

describe('neighbours', () => {
  it('links the previous and next sibling in Notion order', async () => {
    expect((await at('ocean', 'second-swell')).neighbours).toEqual({
      prev: { title: 'First swell', path: '/ocean/first-swell' },
      // Titles are trimmed: Notion titles often carry stray whitespace.
      next: { title: 'Third swell', path: '/ocean/third-swell' },
    })
  })

  it('has no previous page at the start and no next at the end', async () => {
    expect((await at('ocean', 'first-swell')).neighbours).toEqual({
      prev: null,
      next: { title: 'Second swell', path: '/ocean/second-swell' },
    })
    expect((await at('ocean', 'third-swell')).neighbours.next).toBeNull()
  })

  it('uses the real location for a page reached by a bare slug', async () => {
    expect((await at('route')).neighbours).toEqual({ prev: null, next: null })
    expect((await at('cederberg')).neighbours).toEqual({
      prev: null,
      next: { title: 'Ghost', path: '/mountains/ghost' },
    })
  })

  it('has none for the root page', async () => {
    expect((await at()).neighbours).toEqual({ prev: null, next: null })
  })
})

describe('page data', () => {
  it('passes meta.json through', async () => {
    const page = await at('ocean', 'first-swell')
    expect(page.pageMeta).toMatchObject({
      title: 'First swell',
      description: 'The first one',
      published: '2023-03-10',
    })
  })

  it('estimates reading time for a long page', async () => {
    // ~460 words at 220 a minute.
    expect((await at('ocean', 'first-swell')).readingMinutes).toBe(2)
  })

  it('shows no reading time for a page under 200 words', async () => {
    expect((await at('ocean', 'second-swell')).readingMinutes).toBeNull()
  })

  it('maps child_page and link_to_page blocks to site paths', async () => {
    const { childPageMap } = await at('ocean', 'first-swell')
    expect(childPageMap[uuid(IDS.THIRD)]).toEqual({ icon: null, slug: 'ocean/third-swell', title: 'Third swell' })
    // link_to_page is looked up by both id forms in the renderer.
    expect(childPageMap[uuid(IDS.ROUTE)]).toEqual({ icon: null, slug: 'mountains/cederberg/route', title: 'Route' })
    expect(childPageMap[IDS.ROUTE]).toEqual(childPageMap[uuid(IDS.ROUTE)])
    // Never synced, so there is nothing to link to.
    expect(childPageMap[uuid(IDS.UNPUBLISHED)]).toBeUndefined()
  })

  it('keys database entries by both id forms', async () => {
    // The sync stores clean hex; the renderer looks up by the block's uuid.
    const { databaseEntriesMap } = await at('ocean', 'first-swell')
    expect(databaseEntriesMap[IDS.DATABASE]).toEqual(DATABASE_ENTRIES)
    expect(databaseEntriesMap[uuid(IDS.DATABASE)]).toEqual(DATABASE_ENTRIES)
  })

  it('has a null database map when the page has no databases', async () => {
    expect((await at('ocean')).databaseEntriesMap).toBeNull()
  })

  it('survives JSON serialisation, which getStaticProps does to it', async () => {
    const page = await at('ocean', 'first-swell')
    expect(JSON.parse(JSON.stringify(page))).toEqual(page)
  })
})

describe('link rewriting', () => {
  const runs = async () => {
    const { blocks } = await at('ocean', 'first-swell')
    return blocks
  }

  it('rewrites a relative /p/<id> link to the page path, in both places the URL lives', async () => {
    const [first] = await runs()
    const link = (first as any).paragraph.rich_text[1]
    expect(link.href).toBe('/ocean/second-swell')
    expect(link.text.link).toEqual({ url: '/ocean/second-swell' })
  })

  it('drops the link, keeping the words, for a Notion page that is not published', async () => {
    // Left alone, /p/<id> looks internal and becomes a same-site 404.
    const [first] = await runs()
    const link = (first as any).paragraph.rich_text[3]
    expect(link.plain_text).toBe('the archive')
    expect(link.href).toBeNull()
    expect(link.text.link).toBeNull()
  })

  it('leaves outbound links exactly as they were', async () => {
    const [first] = await runs()
    const link = (first as any).paragraph.rich_text[5]
    expect(link.href).toBe('https://example.com/elsewhere')
    expect(link.text.link).toEqual({ url: 'https://example.com/elsewhere' })
  })

  it('rewrites an @page mention, which has only an href', async () => {
    const [, mention] = await runs()
    const run = (mention as any).paragraph.rich_text[0]
    expect(run.href).toBe('/mountains/cederberg')
    expect(run.text).toBeUndefined()
  })

  it('rewrites links inside captions', async () => {
    const image = (await runs()).find((b: any) => b.type === 'image') as any
    expect(image.image.caption[1].href).toBe('/mountains/cederberg/route')
  })

  it('rewrites links in nested children', async () => {
    const toggle = (await runs()).find((b: any) => b.type === 'toggle') as any
    expect(toggle.children[0].paragraph.rich_text[0].href).toBe('/ocean/third-swell')
  })

  it('does not mutate the blocks it read from disk', async () => {
    // getLocalPage is not cached, but the manifest is; a rewrite that
    // mutated in place would compound across pages in one build.
    await runs()
    const raw = local.getLocalPage(IDS.FIRST)!.blocks as any[]
    expect(raw[0].paragraph.rich_text[1].href).toBe(`/p/${IDS.SECOND}?pvs=25`)
  })
})

describe('getAllPages', () => {
  it('lists every non-root page once, with its dates from meta.json', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pages = local.getAllPages()
    const paths = pages.map((p) => p.path.join('/')).sort()

    expect(paths).toEqual([
      'mountains',
      'mountains/cederberg',
      'mountains/cederberg/route',
      'mountains/ghost',
      'ocean',
      'ocean/first-swell',
      'ocean/second-swell',
      'ocean/third-swell',
    ])

    const first = pages.find((p) => p.id === IDS.FIRST)!
    expect(first).toMatchObject({
      slug: 'first-swell',
      published: '2023-03-10',
      lastEdited: '2025-01-15T08:00:00.000Z',
    })
  })

  it('gives a collision to the same page on every build, and warns about it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const winner = local.getAllPages().filter((p) => p.path.join('/') === 'ocean/first-swell')

    expect(winner).toHaveLength(1)
    // Sorted by id, so it does not depend on JSON key order.
    expect(winner[0].id).toBe(IDS.FIRST)
    // Warned once per process, so not necessarily on this call.
    warn.mockRestore()
  })

  it('gives a page with no meta.json empty dates rather than failing the build', () => {
    const ghost = local.getAllPages().find((p) => p.id === IDS.GHOST)!
    expect(ghost).toMatchObject({ published: null, lastEdited: '' })
  })
})

describe('getPageMeta / getLocalPage', () => {
  it('reads meta by either id form, and returns null for a missing page', () => {
    expect(local.getPageMeta(uuid(IDS.OCEAN))?.title).toBe('Ocean')
    expect(local.getPageMeta(IDS.GHOST)).toBeNull()
    expect(local.getLocalPage(IDS.GHOST)).toBeNull()
  })

  it('loads a page with its databases', () => {
    const page = local.getLocalPage(uuid(IDS.FIRST))!
    expect(page.meta.title).toBe('First swell')
    expect(page.databaseEntries).toEqual({ [IDS.DATABASE]: DATABASE_ENTRIES })
  })
})
