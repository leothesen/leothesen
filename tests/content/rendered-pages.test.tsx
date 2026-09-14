// @vitest-environment jsdom
import * as fs from 'fs'
import * as path from 'path'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { NotionPage } from '@/components/NotionPage'
import * as config from '@/lib/config'
import { getAllPages, getManifest } from '@/lib/notion-local'
import { resolveNotionPageLocal } from '@/lib/resolve-notion-page-local'

vi.mock('next/router', () => ({
  useRouter: () => ({ isFallback: false, push: () => {}, events: { on() {}, off() {} } }),
}))
// Keep the <head> tags in the output, so canonicals can be checked too.
vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

/**
 * Every committed page, rendered the way the server renders it, then read back
 * as HTML.
 *
 * The unit tests prove each piece does what it says. These prove the pieces
 * add up on the content that actually ships — which is where this site has
 * broken: links to pages that were renamed, a raw /<uuid> link to a page that
 * was never synced, an embed with an empty src framing the page itself. None
 * of those is a code bug a unit test would catch, and all of them reached the
 * live site.
 *
 * Failures are collected across every page and asserted once, so a red run
 * lists every offending page rather than stopping at the first.
 */

interface Rendered {
  path: string
  doc: Document
  canonicalPath: string
}

const manifest = getManifest()
const sitePaths = new Set(['/', ...Object.values(manifest.pages).filter((p) => p.slugPath.length).map((p) => '/' + p.slugPath.join('/'))])
// Routes served by pages/ rather than by Notion content. The API routes are
// linked from /engineering/leothesen-com, which is about the site itself.
const ROUTES = new Set([
  '/archive',
  '/feed',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
  ...fs.readdirSync(path.join(process.cwd(), 'pages', 'api')).map((f) => `/api/${f.replace(/\.tsx?$/, '')}`),
])

const rendered: Rendered[] = []
const renderErrors: string[] = []

beforeAll(async () => {
  // next/image's priority preload goes through Next's internal <Head>, which
  // warns about useLayoutEffect once per image when rendered to a string.
  // Harmless here and several hundred lines of noise; anything else still prints.
  const consoleError = console.error
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
    consoleError(...args)
  })

  const targets = [[] as string[], ...getAllPages().map((p) => p.path)]
  const parser = new DOMParser()

  for (const segments of targets) {
    const urlPath = '/' + segments.join('/')
    try {
      const props: any = await resolveNotionPageLocal(config.domain, segments.length ? segments : undefined)
      if (props.error) {
        renderErrors.push(`${urlPath}: ${props.error.message}`)
        continue
      }
      // Exactly what getStaticProps hands the page.
      const serialised = JSON.parse(JSON.stringify(props))
      const html = renderToStaticMarkup(<NotionPage {...serialised} />)
      rendered.push({ path: urlPath, doc: parser.parseFromString(html, 'text/html'), canonicalPath: props.canonicalPath })
    } catch (err) {
      renderErrors.push(`${urlPath}: ${(err as Error).message}`)
    }
  }
}, 120_000)

const hrefs = (doc: Document) => [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!)

describe('every published page', () => {
  it('renders', () => {
    expect(renderErrors).toEqual([])
    // A render loop that silently skipped everything would pass the rest.
    expect(rendered.length).toBe(getAllPages().length + 1)
  })

  it('has exactly one <h1>', () => {
    const offenders = rendered
      .map(({ path, doc }) => [path, doc.querySelectorAll('h1').length] as const)
      .filter(([, count]) => count !== 1)
      .map(([path, count]) => `${path} (${count})`)
    expect(offenders).toEqual([])
  })

  it('declares a canonical URL that is its own real path', () => {
    const offenders: string[] = []
    for (const { path, doc, canonicalPath } of rendered) {
      const canonical = doc.querySelector('link[rel=canonical]')?.getAttribute('href')
      if (canonical !== `${config.host}${canonicalPath}` || !sitePaths.has(canonicalPath)) {
        offenders.push(`${path} -> ${canonical}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('links', () => {
  it('points every internal link at a page that exists', () => {
    const dead: string[] = []
    for (const { path, doc } of rendered) {
      for (const href of hrefs(doc)) {
        if (!href.startsWith('/') || href.startsWith('//')) continue
        const target = decodeURI(href.split(/[?#]/)[0])
        if (!sitePaths.has(target) && !ROUTES.has(target)) dead.push(`${path} -> ${href}`)
      }
    }
    expect(dead).toEqual([])
  })

  it('points every absolute leothesen.com link at a page that exists', () => {
    // These open in a new tab and count as external referrals, but a dead one
    // is worse still — both 404s found in September were this kind.
    const dead: string[] = []
    for (const { path, doc } of rendered) {
      for (const href of hrefs(doc)) {
        let url: URL
        try {
          url = new URL(href)
        } catch {
          continue
        }
        if (url.hostname !== 'leothesen.com' && url.hostname !== 'www.leothesen.com') continue
        const target = decodeURI(url.pathname).replace(/\/$/, '') || '/'
        if (!sitePaths.has(target) && !ROUTES.has(target)) dead.push(`${path} -> ${href}`)
      }
    }
    expect(dead).toEqual([])
  })

  it('leaves no raw Notion page links behind', () => {
    // /p/<id> looks internal to the renderer and 404s; notion.so links send
    // readers to a private workspace.
    const id = '[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}'
    const rawLink = new RegExp(`^/(?:p/)?${id}(?:$|[?#])|notion\\.(?:so|site|com)/`, 'i')
    const raw: string[] = []
    for (const { path, doc } of rendered) {
      for (const href of hrefs(doc)) {
        if (rawLink.test(href)) {
          raw.push(`${path} -> ${href}`)
        }
      }
    }
    expect(raw).toEqual([])
  })

  it('points every in-page anchor at an element on that page', () => {
    const dead: string[] = []
    for (const { path, doc } of rendered) {
      for (const href of hrefs(doc)) {
        if (!href.startsWith('#') || href === '#') continue
        if (!doc.getElementById(decodeURIComponent(href.slice(1)))) dead.push(`${path} -> ${href}`)
      }
    }
    expect(dead).toEqual([])
  })

  it('never opens a new tab without noopener', () => {
    const unsafe: string[] = []
    for (const { path, doc } of rendered) {
      for (const a of doc.querySelectorAll('a[target=_blank]')) {
        if (!/noopener|noreferrer/.test(a.getAttribute('rel') || '')) unsafe.push(`${path} -> ${a.getAttribute('href')}`)
      }
    }
    expect(unsafe).toEqual([])
  })
})

describe('media', () => {
  it('never renders an iframe without a src', () => {
    // An empty src resolves against the current page and frames the site in itself.
    const empty = rendered.flatMap(({ path, doc }) =>
      [...doc.querySelectorAll('iframe')].filter((f) => !f.getAttribute('src')).map(() => path)
    )
    expect(empty).toEqual([])
  })

  it('frames nothing over plain http', () => {
    const insecure = rendered.flatMap(({ path, doc }) =>
      [...doc.querySelectorAll('iframe[src], img[src], video[src]')]
        .map((el) => el.getAttribute('src')!)
        .filter((src) => src.startsWith('http:'))
        .map((src) => `${path}: ${src}`)
    )
    expect(insecure).toEqual([])
  })
})

describe('block coverage', () => {
  // Block types that appear in the content and deliberately render nothing, or
  // render only through their parent. Anything else that renders nothing is a
  // block Notion added and the renderer has never heard of — it vanishes from
  // the page without an error, which is exactly how it would go unnoticed.
  //
  // Listed rather than ignored so a *new* type fails this test. The last four
  // are real content currently missing from the live site; each needs a case in
  // components/NotionRenderer.tsx before it can come off this list.
  const HANDLED_BY_PARENT = ['column', 'table_row']
  const KNOWN_UNRENDERED = ['table_of_contents', 'unsupported', 'equation', 'audio', 'heading_4']

  const RENDERED = [
    'paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item',
    'to_do', 'toggle', 'code', 'image', 'video', 'embed', 'link_preview', 'bookmark', 'quote',
    'callout', 'divider', 'table', 'column_list', 'child_page', 'link_to_page', 'child_database',
    'synced_block', 'file',
  ]

  it('knows every block type in the content', () => {
    const seen = new Map<string, string>()
    const walk = (blocks: any[], where: string) => {
      for (const b of blocks || []) {
        if (!seen.has(b.type)) seen.set(b.type, where)
        walk(b.children, where)
      }
    }
    for (const [id, page] of Object.entries(manifest.pages)) {
      const file = path.join(process.cwd(), '.content', 'pages', id, 'blocks.json')
      if (!fs.existsSync(file)) continue
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
      walk(Array.isArray(raw) ? raw : raw.blocks, '/' + page.slugPath.join('/'))
    }

    const known = new Set([...RENDERED, ...HANDLED_BY_PARENT, ...KNOWN_UNRENDERED])
    const unknown = [...seen].filter(([type]) => !known.has(type)).map(([type, where]) => `${type} (first on ${where})`)
    expect(unknown).toEqual([])
  })
})
