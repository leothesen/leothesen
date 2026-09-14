// @vitest-environment jsdom
import * as React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BlockTableOfContents, extractHeadingsFromBlocks } from '@/components/BlockTableOfContents'
import { NotionPage } from '@/components/NotionPage'

const router = vi.hoisted(() => ({ isFallback: false, push: () => {}, events: { on: () => {}, off: () => {} } }))
vi.mock('next/router', () => ({ useRouter: () => router }))
vi.mock('next/head', () => ({ default: () => null }))

const ROOT = '2a9bf7526da84f7daa846a866faf1799'
const site = { name: 'Leo Thesen', domain: 'leothesen.com', rootNotionPageId: ROOT, rootNotionSpaceId: null }

const run = (content: string) => ({
  type: 'text',
  text: { content, link: null },
  annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
  plain_text: content,
  href: null,
})
const heading = (id: string, level: 1 | 2 | 3, content: string, children?: any[]): any => ({
  id,
  type: `heading_${level}`,
  [`heading_${level}`]: { rich_text: [run(content)] },
  ...(children ? { children } : {}),
})
const paragraph = (id: string, content: string): any => ({ id, type: 'paragraph', paragraph: { rich_text: [run(content)] } })

const meta = (overrides = {}) => ({
  id: 'x',
  title: 'First swell',
  icon: '🌊',
  cover: null,
  description: null,
  published: null,
  author: null,
  lastEdited: '2025-01-15T12:00:00.000Z',
  slug: 'first-swell',
  order: null,
  ...overrides,
})

class IO {
  static instances: IO[] = []
  observed: Element[] = []
  constructor(public callback: IntersectionObserverCallback) {
    IO.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return []
  }
}

beforeEach(() => {
  router.isFallback = false
  IO.instances = []
  vi.stubGlobal('IntersectionObserver', IO)
})

describe('an article page', () => {
  const blocks = [heading('h-a', 1, 'Arrival'), paragraph('p', 'Words.'), heading('h-b', 2, 'Departure')]

  function renderArticle(extra = {}) {
    return render(
      <NotionPage
        site={site}
        pageId="article-id"
        pageMeta={meta({ published: '2023-03-10T12:00:00.000Z' })}
        blocks={blocks}
        breadcrumbs={[{ title: 'Ocean', icon: null, href: '/ocean' }]}
        readingMinutes={4}
        neighbours={{ prev: { title: 'Ocean intro', path: '/ocean/intro' }, next: { title: 'Second swell', path: '/ocean/second-swell' } }}
        canonicalPath="/ocean/first-swell"
        {...extra}
      />
    )
  }

  it('has exactly one <h1>, the page title', () => {
    const { container } = renderArticle()
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe('First swell')
  })

  it('offers a skip link that lands on a focusable main', () => {
    const { container } = renderArticle()
    const skip = screen.getByText('Skip to content')
    expect(skip.getAttribute('href')).toBe('#notion-content')
    const main = container.querySelector('main#notion-content')!
    expect(main.getAttribute('tabindex')).toBe('-1')
    // It is the first focusable element on the page.
    expect(container.querySelector('a, button')).toBe(skip)
  })

  it('shows published and edited dates and the reading time', () => {
    const { container } = renderArticle()
    expect([...container.querySelectorAll('.notion-page-date')].map((d) => d.textContent)).toEqual([
      'March 10, 2023',
      'Last edited January 15, 2025',
      '4 min read',
    ])
  })

  it('links the neighbouring pages', () => {
    renderArticle()
    const nav = screen.getByRole('navigation', { name: 'Nearby pages' })
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['PreviousOcean intro', '/ocean/intro'],
      ['NextSecond swell', '/ocean/second-swell'],
    ])
  })

  it('keeps the next link on the right when there is no previous page', () => {
    renderArticle({ neighbours: { prev: null, next: { title: 'Second swell', path: '/ocean/second-swell' } } })
    const nav = screen.getByRole('navigation', { name: 'Nearby pages' })
    expect(nav.children).toHaveLength(2)
    expect(nav.children[0].tagName).toBe('SPAN')
  })

  it('renders the breadcrumb trail after Home', () => {
    renderArticle()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect([...crumbs.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/', '/ocean'])
  })

  it('shows a table of contents built from the headings', () => {
    const { container } = renderArticle()
    const toc = container.querySelector('aside.notion-toc')!
    expect([...toc.querySelectorAll('nav a')].map((a) => a.getAttribute('href'))).toEqual(['#h-a', '#h-b'])
  })

  it('renders an emoji icon as text and an image icon through next/image', () => {
    const { container, rerender } = renderArticle()
    expect(container.querySelector('.notion-page-icon-emoji')!.textContent).toBe('🌊')

    rerender(<NotionPage site={site} pageId="article-id" pageMeta={meta({ icon: 'https://x.public.blob.vercel-storage.com/me.png' })} blocks={[]} />)
    const img = container.querySelector('.notion-page-icon-hero img')!
    expect(img.getAttribute('src')).toContain('/_next/image?url=')
    expect(img.getAttribute('width')).toBe('80')
  })

  it('renders the cover eagerly, since it is the largest thing above the fold', () => {
    const { container } = render(
      <NotionPage site={site} pageId="article-id" pageMeta={meta({ cover: 'https://x.public.blob.vercel-storage.com/c.jpg' })} blocks={[]} />
    )
    const cover = container.querySelector('.notion-page-cover-wrapper img')!
    expect(cover.getAttribute('loading')).not.toBe('lazy')
    expect(cover.getAttribute('alt')).toBe('First swell')
  })
})

describe('the home page', () => {
  it('drops the article furniture', () => {
    const { container } = render(
      <NotionPage
        site={site}
        pageId={ROOT}
        pageMeta={meta({ title: 'Leo Thesen' })}
        blocks={[heading('a', 1, 'One'), heading('b', 1, 'Two')]}
        neighbours={{ prev: null, next: { title: 'x', path: '/x' } }}
        readingMinutes={3}
      />
    )
    expect(container.querySelector('main')!.className).toContain('index-page')
    expect(container.querySelector('.notion-page-meta')).toBeNull()
    expect(container.querySelector('.notion-page-neighbours')).toBeNull()
    expect(container.querySelector('.notion-toc')).toBeNull()
  })
})

describe('error and loading states', () => {
  it('renders the not-found page for an error', () => {
    render(<NotionPage site={site} error={{ statusCode: 404, message: 'Not found "nope"' }} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page Not Found')
    expect(screen.getByText('Not found "nope"')).toBeTruthy()
  })

  it('renders the not-found page when there is no page data at all', () => {
    render(<NotionPage site={site} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page Not Found')
  })

  it('shows the loader while a fallback page is being generated', () => {
    router.isFallback = true
    const { container } = render(<NotionPage site={site} pageMeta={meta()} />)
    expect(container.querySelector('h1')).toBeNull()
  })
})

describe('table of contents', () => {
  it('extracts headings in document order, including nested ones', () => {
    const blocks = [
      heading('a', 1, 'One'),
      { id: 't', type: 'toggle', toggle: { rich_text: [] }, children: [heading('b', 3, 'Nested')] },
      heading('c', 2, 'Two'),
    ] as any
    expect(extractHeadingsFromBlocks(blocks)).toEqual([
      { id: 'a', text: 'One', level: 1 },
      { id: 'b', text: 'Nested', level: 3 },
      { id: 'c', text: 'Two', level: 2 },
    ])
  })

  it('is not worth showing for fewer than two headings', () => {
    const { container } = render(<BlockTableOfContents headings={[{ id: 'a', text: 'Only', level: 1 }]} />)
    expect(container.innerHTML).toBe('')
  })

  it('indents relative to the shallowest heading present', () => {
    const { container } = render(
      <BlockTableOfContents
        headings={[
          { id: 'a', text: 'Two', level: 2 },
          { id: 'b', text: 'Three', level: 3 },
        ]}
      />
    )
    expect([...container.querySelectorAll('li')].map((li) => (li as HTMLElement).style.paddingLeft)).toEqual(['0px', '12px'])
  })

  it('highlights the heading scrolled into view', () => {
    document.body.innerHTML = '<h2 id="a">A</h2><h2 id="b">B</h2>'
    const { container } = render(
      <BlockTableOfContents
        headings={[
          { id: 'a', text: 'A', level: 2 },
          { id: 'b', text: 'B', level: 2 },
        ]}
      />
    )
    const observer = IO.instances.at(-1)!
    expect(observer.observed.map((el) => el.id)).toEqual(['a', 'b'])

    act(() => {
      observer.callback([{ isIntersecting: true, target: document.getElementById('b')! } as any], observer as any)
    })
    expect(container.querySelector('.notion-toc-active a')!.getAttribute('href')).toBe('#b')
  })
})
