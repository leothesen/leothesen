// @vitest-environment jsdom
// Rendered to a string, the way the server sends it; jsdom is only here for
// DOMParser, to query the result.
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PageHead } from '@/components/PageHead'

// next/head portals into the document head through a context Next provides.
// Outside Next it renders nothing, so pass its children straight through.
vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

const site = {
  name: 'Leo Thesen',
  domain: 'leothesen.com',
  rootNotionPageId: '2a9bf7526da84f7daa846a866faf1799',
  rootNotionSpaceId: null,
  description: "Leo Thesen's digital garden",
}

function head(props: React.ComponentProps<typeof PageHead>) {
  const html = renderToStaticMarkup(<PageHead {...props} />)
  const doc = new DOMParser().parseFromString(`<html><head>${html}</head></html>`, 'text/html')
  const meta = (attr: 'name' | 'property', key: string) =>
    doc.querySelector(`meta[${attr}="${key}"]`)?.getAttribute('content') ?? null
  const ld = doc.querySelector('script[type="application/ld+json"]')
  return {
    html,
    doc,
    meta,
    canonical: doc.querySelector('link[rel=canonical]')?.getAttribute('href') ?? null,
    jsonLd: ld ? JSON.parse(ld.textContent!) : null,
  }
}

describe('article pages', () => {
  const article = () =>
    head({
      site,
      pageId: 'c970c4d2e41d44b4b0d14fd8e8c53a79',
      title: 'On smoking and five-way stop streets',
      description: 'A short one',
      image: 'https://x.public.blob.vercel-storage.com/cover.jpg',
      url: 'https://leothesen.com/novel-experiences/sabbatical/on-smoking',
      isArticle: true,
      publishedTime: '2022-07-10T18:15:00.000Z',
      modifiedTime: '2022-07-30T08:20:00.000Z',
    })

  it('declares an article with its dates and canonical URL', () => {
    const { meta, canonical, doc } = article()
    expect(doc.querySelector('title')!.textContent).toBe('On smoking and five-way stop streets')
    expect(meta('property', 'og:type')).toBe('article')
    expect(meta('property', 'article:published_time')).toBe('2022-07-10T18:15:00.000Z')
    expect(meta('property', 'article:modified_time')).toBe('2022-07-30T08:20:00.000Z')
    expect(canonical).toBe('https://leothesen.com/novel-experiences/sabbatical/on-smoking')
    expect(meta('property', 'og:url')).toBe(canonical)
    expect(meta('name', 'robots')).toBe('index,follow')
  })

  it('uses the generated social image rather than the raw cover', () => {
    const { meta } = article()
    const image = 'https://leothesen.com/api/social-image?id=c970c4d2e41d44b4b0d14fd8e8c53a79'
    // NODE_ENV is "test", not development, so host is the real domain.
    expect(meta('property', 'og:image')).toBe(image)
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
  })

  it('emits Article structured data anchored to the canonical URL', () => {
    expect(article().jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'On smoking and five-way stop streets',
      description: 'A short one',
      image: ['https://leothesen.com/api/social-image?id=c970c4d2e41d44b4b0d14fd8e8c53a79'],
      datePublished: '2022-07-10T18:15:00.000Z',
      dateModified: '2022-07-30T08:20:00.000Z',
      author: { '@type': 'Person', name: 'Leo Thesen', url: 'https://leothesen.com' },
      publisher: { '@type': 'Person', name: 'Leo Thesen', url: 'https://leothesen.com' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://leothesen.com/novel-experiences/sabbatical/on-smoking' },
    })
  })

  it('advertises the RSS feed at the route that actually serves it', () => {
    const { doc } = article()
    expect(doc.querySelector('link[type="application/rss+xml"]')!.getAttribute('href')).toBe('https://leothesen.com/feed')
  })
})

describe('structured data safety', () => {
  it('cannot be broken out of by a page title', () => {
    const title = 'Hello </script><script>alert(1)</script>'
    const { html, jsonLd, doc } = head({ site, title, url: 'https://leothesen.com/x', isArticle: true })

    // Exactly one script element, and it still parses back to the real title.
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect(html).not.toContain('</script><script>')
    expect(jsonLd.headline).toBe(title)
  })

  it('is omitted when there is no canonical URL to anchor it', () => {
    const { jsonLd, canonical } = head({ site, title: 'No URL' })
    expect(jsonLd).toBeNull()
    expect(canonical).toBeNull()
  })
})

describe('the home page', () => {
  it('is a WebSite, not an Article', () => {
    const { jsonLd, meta } = head({ site, title: 'Leo Thesen', url: 'https://leothesen.com/', isArticle: false })
    expect(meta('property', 'og:type')).toBe('website')
    expect(meta('property', 'article:published_time')).toBeNull()
    expect(jsonLd['@type']).toBe('WebSite')
    expect(jsonLd.url).toBe('https://leothesen.com')
  })
})

describe('fallbacks', () => {
  it('falls back to the site name and description', () => {
    const { doc, meta } = head({ site })
    expect(doc.querySelector('title')!.textContent).toBe('Leo Thesen')
    expect(meta('name', 'description')).toBe("Leo Thesen's digital garden")
  })

  it('uses the cover when there is no page id, and a small card with no image at all', () => {
    expect(head({ site, image: 'https://x/cover.jpg' }).meta('property', 'og:image')).toBe('https://x/cover.jpg')
    const bare = head({ site })
    expect(bare.meta('property', 'og:image')).toBeNull()
    expect(bare.meta('name', 'twitter:card')).toBe('summary')
  })

  it('asks crawlers not to index when told to', () => {
    expect(head({ site, noindex: true }).meta('name', 'robots')).toBe('noindex,follow')
  })
})
