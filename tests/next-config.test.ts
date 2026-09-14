import * as fs from 'fs'
import * as path from 'path'

import { describe, expect, it } from 'vitest'
// The same matcher the /_next/image optimizer runs on every request.
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'

import { getManifest } from '@/lib/notion-local'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../next.config.js')

describe('security headers', () => {
  it('applies to every path', async () => {
    const rules = await nextConfig.headers()
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/:path*')
  })

  const header = async (key: string) =>
    (await nextConfig.headers())[0].headers.find((h: { key: string }) => h.key === key)?.value as string | undefined

  it('sends the cheap, uncontroversial ones', async () => {
    expect(await header('X-Content-Type-Options')).toBe('nosniff')
    expect(await header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(await header('Permissions-Policy')).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/)
  })

  it('has a content security policy that keeps its load-bearing directives', async () => {
    const csp = await header('Content-Security-Policy')
    const directives = Object.fromEntries(
      csp!.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
        const [name, ...values] = d.split(/\s+/)
        return [name, values]
      })
    )

    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
    // Nobody may frame this site.
    expect(directives['frame-ancestors']).toEqual(["'self'"])
    // Embeds come from whatever is pasted into Notion, so frames are https-only
    // rather than host-listed — a host list would silently blank the next one.
    expect(directives['frame-src']).toEqual(['https:'])
    expect(directives).toHaveProperty('upgrade-insecure-requests')
  })

  it('lets analytics load and report, or it goes dark with no error', async () => {
    // PostHog was silently off for six months once; a CSP block would do the
    // same thing again, visible only as a console message nobody reads.
    const csp = (await header('Content-Security-Policy'))!
    const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '))!
    expect(directive('script-src')).toContain('https://*.posthog.com')
    expect(directive('connect-src')).toContain('https://*.posthog.com')
    expect(directive('script-src')).toContain('https://va.vercel-scripts.com')
  })
})

describe('image optimisation', () => {
  const { remotePatterns } = nextConfig.images
  const allowed = (url: string) => hasRemoteMatch([], remotePatterns, new URL(url))

  /** Every URL the site hands to next/image, from the committed content. */
  function imageUrls(): { url: string; where: string }[] {
    const manifest = getManifest()
    const found: { url: string; where: string }[] = []
    const add = (url: unknown, where: string) => {
      // Emoji icons and relative paths never reach the remote optimizer.
      if (typeof url === 'string' && /^https?:/.test(url)) found.push({ url, where })
    }
    const walk = (blocks: any[], where: string) => {
      for (const b of blocks || []) {
        if (b.type === 'image') add(b.image?.external?.url ?? b.image?.file?.url, where)
        walk(b.children, where)
      }
    }

    for (const [id, page] of Object.entries(manifest.pages)) {
      const where = '/' + page.slugPath.join('/')
      add(page.cover, `${where} (cover)`)
      add(page.icon, `${where} (icon)`)

      const dir = path.join(process.cwd(), '.content', 'pages', id)
      if (!fs.existsSync(path.join(dir, 'blocks.json'))) continue
      const raw = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf-8'))
      walk(Array.isArray(raw) ? raw : raw.blocks, where)

      const dbDir = path.join(dir, 'databases')
      if (fs.existsSync(dbDir)) {
        for (const file of fs.readdirSync(dbDir)) {
          for (const entry of JSON.parse(fs.readFileSync(path.join(dbDir, file), 'utf-8'))) {
            add(entry.cover, `${where} (gallery card "${entry.title}")`)
          }
        }
      }
    }
    return found
  }

  it('allows every image host the content actually uses', () => {
    // A host missing here does not fail the build: /_next/image answers 400
    // at request time and the reader sees a broken image.
    const urls = imageUrls()
    expect(urls.length).toBeGreaterThan(1000)

    // One line per refused host, not per image — a missing host is usually
    // hundreds of images.
    const refused = new Map<string, { first: string; count: number }>()
    for (const { url, where } of urls) {
      if (allowed(url)) continue
      const host = new URL(url).host
      const seen = refused.get(host)
      refused.set(host, { first: seen?.first ?? where, count: (seen?.count ?? 0) + 1 })
    }
    expect([...refused].map(([host, { first, count }]) => `${host}: ${count} image(s), first on ${first}`)).toEqual([])
  })

  it('refuses arbitrary hosts, so the optimizer is not an open proxy', () => {
    expect(allowed('https://evil.example/pwn.png')).toBe(false)
    expect(allowed('http://ch1i5qbcxmt5qkvq.public.blob.vercel-storage.com/a.jpg')).toBe(false)
  })

  it('serves modern formats and sandboxes SVG', () => {
    expect(nextConfig.images.formats).toEqual(['image/avif', 'image/webp'])
    // dangerouslyAllowSVG is only safe with this policy alongside it.
    expect(nextConfig.images.dangerouslyAllowSVG).toBe(true)
    expect(nextConfig.images.contentSecurityPolicy).toContain("script-src 'none'")
    expect(nextConfig.images.contentSecurityPolicy).toContain('sandbox')
  })
})
