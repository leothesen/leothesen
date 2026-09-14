import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * lib/config.ts resolves everything at import time, so each case stubs the
 * environment, resets the module registry and imports it fresh.
 */
async function loadConfig(env: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  return import('@/lib/config')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const POSTHOG_VARS = {
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: undefined,
  NEXT_PUBLIC_POSTHOG_KEY: undefined,
  NEXT_PUBLIC_POSTHOG_ID: undefined,
}

describe('site config', () => {
  it('exposes the site identity from site.config.ts', async () => {
    const config = await loadConfig()
    expect(config.site).toEqual({
      domain: 'leothesen.com',
      name: 'Leo Thesen',
      rootNotionPageId: '2a9bf7526da84f7daa846a866faf1799',
      rootNotionSpaceId: null,
      description: expect.any(String),
    })
  })

  it('lets NEXT_PUBLIC_SITE_CONFIG override site.config.ts', async () => {
    const config = await loadConfig({ NEXT_PUBLIC_SITE_CONFIG: JSON.stringify({ name: 'Preview' }) })
    expect(config.name).toBe('Preview')
    expect(config.domain).toBe('leothesen.com')
  })

  it('fails loudly on an unparseable NEXT_PUBLIC_SITE_CONFIG', async () => {
    // A silently ignored override would deploy the wrong site config.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadConfig({ NEXT_PUBLIC_SITE_CONFIG: '{not json' })).rejects.toThrow()
  })

  it('rejects a pageUrlOverrides path without a leading slash', async () => {
    await expect(
      loadConfig({
        NEXT_PUBLIC_SITE_CONFIG: JSON.stringify({ pageUrlOverrides: { about: '2a9bf7526da84f7daa846a866faf1799' } }),
      })
    ).rejects.toThrow(/should start with "\/"/)
  })

  it('rejects a pageUrlOverrides value that is not a page id', async () => {
    await expect(
      loadConfig({ NEXT_PUBLIC_SITE_CONFIG: JSON.stringify({ pageUrlOverrides: { '/about': 'nope' } }) })
    ).rejects.toThrow(/Invalid pageUrlOverrides page id/)
  })

  it('normalises pageUrlOverrides and builds the inverse map', async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_SITE_CONFIG: JSON.stringify({
        pageUrlOverrides: { '/about': '2a9bf752-6da8-4f7d-aa84-6a866faf1799' },
      }),
    })
    expect(config.pageUrlOverrides).toEqual({ about: '2a9bf7526da84f7daa846a866faf1799' })
    expect(config.inversePageUrlOverrides).toEqual({ '2a9bf7526da84f7daa846a866faf1799': 'about' })
  })
})

describe('hosts', () => {
  it('points at the real domain outside development', async () => {
    const config = await loadConfig({ NODE_ENV: 'production', VERCEL_URL: undefined })
    expect(config.host).toBe('https://leothesen.com')
    expect(config.apiHost).toBe('https://leothesen.com')
  })

  it('sends API calls to the deployment itself on a Vercel preview', async () => {
    // The social image renderer fetches page info over HTTP; on a preview it
    // must hit that preview, not production.
    const config = await loadConfig({ NODE_ENV: 'production', VERCEL_URL: 'leothesen-git-x.vercel.app' })
    expect(config.apiHost).toBe('https://leothesen-git-x.vercel.app')
    expect(config.host).toBe('https://leothesen.com')
  })

  it('uses localhost and PORT in development', async () => {
    const config = await loadConfig({ NODE_ENV: 'development', PORT: '4000' })
    expect(config.host).toBe('http://localhost:4000')
  })
})

describe('posthogId', () => {
  it('is undefined when no key is set, which keeps analytics a no-op', async () => {
    const config = await loadConfig(POSTHOG_VARS)
    expect(config.posthogId).toBeFalsy()
  })

  it.each([
    ['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', "PostHog's setup wizard"],
    ['NEXT_PUBLIC_POSTHOG_KEY', "PostHog's docs"],
    ['NEXT_PUBLIC_POSTHOG_ID', 'the starter kit'],
  ])('reads %s (the name %s uses)', async (name) => {
    const config = await loadConfig({ ...POSTHOG_VARS, [name]: 'phc_test' })
    expect(config.posthogId).toBe('phc_test')
  })

  it('prefers the project token when several are set', async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_token',
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_key',
      NEXT_PUBLIC_POSTHOG_ID: 'phc_id',
    })
    expect(config.posthogId).toBe('phc_token')
  })
})

describe('getEnv / getSiteConfig', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

  it('returns the value, then the default, then throws', async () => {
    const { getEnv } = await import('@/lib/get-config-value')
    expect(getEnv('A', undefined, env({ A: 'set' }))).toBe('set')
    expect(getEnv('A', 'fallback', env({}))).toBe('fallback')
    expect(() => getEnv('A', undefined, env({}))).toThrow(/missing required env variable "A"/)
  })

  it('keeps an explicit empty string rather than treating it as missing', async () => {
    const { getEnv } = await import('@/lib/get-config-value')
    expect(getEnv('A', 'fallback', env({ A: '' }))).toBe('')
  })

  it('throws for a required site config key that is absent', async () => {
    const { getSiteConfig } = await import('@/lib/get-config-value')
    expect(getSiteConfig('name')).toBe('Leo Thesen')
    expect(getSiteConfig('doesNotExist', 'dflt')).toBe('dflt')
    expect(() => getSiteConfig('doesNotExist')).toThrow(/missing required site config value/)
  })
})

describe('getSocialImageUrl', () => {
  it('points at the OG image route with the page id', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { getSocialImageUrl } = await import('@/lib/get-social-image-url')
    expect(getSocialImageUrl('abc')).toBe('https://leothesen.com/api/social-image?id=abc')
  })

  it('returns null without a page id', async () => {
    const { getSocialImageUrl } = await import('@/lib/get-social-image-url')
    expect(getSocialImageUrl('')).toBeNull()
  })
})
