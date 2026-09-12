import { describe, expect, it, vi } from 'vitest'

import { getAllPages, getManifest } from '@/lib/notion-local'
import * as notFound from '../../pages/404'
import * as catchAll from '../../pages/[...pageId]'
import * as archive from '../../pages/archive'
import * as home from '../../pages/index'

vi.mock('next/router', () => ({ useRouter: () => ({ isFallback: false }) }))

const pages = getAllPages()
const manifest = getManifest()

describe('/[...pageId]', () => {
  it('prerenders every published page, and blocks rather than 200s on the rest', async () => {
    const { paths, fallback } = await catchAll.getStaticPaths()
    expect(paths).toHaveLength(pages.length)
    expect(paths.map((p: any) => p.params.pageId.join('/')).sort()).toEqual(pages.map((p) => p.path.join('/')).sort())
    // With `true`, an unknown URL is committed as a 200 before getStaticProps
    // can say it does not exist.
    expect(fallback).toBe('blocking')
  })

  it('answers an unknown path with a real 404, not a 200 page that says so', async () => {
    const result = await catchAll.getStaticProps({ params: { pageId: ['no', 'such-page'] } } as any)
    expect(result).toEqual({ notFound: true })
  })

  it('returns serialisable props for a real page', async () => {
    const page = pages.find((p) => p.path.length > 1)!
    const result: any = await catchAll.getStaticProps({ params: { pageId: page.path } } as any)

    expect(result.notFound).toBeUndefined()
    expect(result.props.pageId).toBe(page.id)
    expect(result.props.canonicalPath).toBe('/' + page.path.join('/'))
    expect(result.props.error).toBeUndefined()
    // Next refuses `undefined` in props; the JSON round-trip is what prevents it.
    expect(JSON.stringify(result.props)).not.toContain('undefined')
  })
})

describe('/', () => {
  it('renders the root Notion page', async () => {
    const { props }: any = await home.getStaticProps()
    expect(props.pageId).toBe('2a9bf7526da84f7daa846a866faf1799')
    expect(props.canonicalPath).toBe('/')
    expect(props.blocks.length).toBeGreaterThan(0)
  })
})

describe('/404', () => {
  it('offers every top-level section, following the manifest', async () => {
    const { props }: any = await notFound.getStaticProps({} as any)
    expect(props.sections).toEqual(
      Object.entries(manifest.slugTree).map(([slug, node]) => ({ title: node.title.trim(), path: `/${slug}` }))
    )
  })
})

describe('/archive', () => {
  it('groups pages by year, newest first', async () => {
    const { props }: any = await archive.getStaticProps({} as any)

    const years = props.years.map((y: any) => y.year)
    expect([...years].sort().reverse()).toEqual(years)

    const all = props.years.flatMap((y: any) => y.entries)
    expect(all).toHaveLength(props.total)
    expect(all.map((e: any) => e.date)).toEqual([...all.map((e: any) => e.date)].sort().reverse())
    for (const { year, entries } of props.years) {
      expect(entries.every((e: any) => e.date.startsWith(year))).toBe(true)
    }
  })

  it('dates each page by when it was written, not when it was last touched', async () => {
    const { props }: any = await archive.getStaticProps({} as any)
    const byPath = new Map(props.years.flatMap((y: any) => y.entries).map((e: any) => [e.path, e]))
    const { getPageMeta } = await import('@/lib/notion-local')

    let moved = 0
    for (const page of pages) {
      const meta: any = getPageMeta(page.id)
      const entry: any = byPath.get('/' + page.path.join('/'))
      if (!entry) continue
      expect(entry.date).toBe(new Date(meta.published || meta.created).toISOString())
      if (meta.lastEdited && new Date(meta.lastEdited).toISOString() !== entry.date) moved++
    }
    // The whole point of not using lastEdited: plenty of pages differ.
    expect(moved).toBeGreaterThan(10)
  })

  it('lists every published page that has a date, labelled with its section', async () => {
    const { props }: any = await archive.getStaticProps({} as any)
    const entries = props.years.flatMap((y: any) => y.entries)
    expect(props.total).toBeGreaterThan(pages.length * 0.9)

    const sectionTitles = new Set(Object.values(manifest.slugTree).map((n) => n.title.trim()))
    for (const entry of entries) {
      expect(sectionTitles.has(entry.section)).toBe(true)
      expect(entry.day).toMatch(/^\d{1,2} [A-Z][a-z]{2,3}$/)
    }
  })
})
