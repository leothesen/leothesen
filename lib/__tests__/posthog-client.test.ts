import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Analytics was dark for six months once without anything noticing, and the
 * contract that matters most is the quiet one: with no key configured the
 * client must do nothing at all. With a key it must start exactly once, with
 * the settings the rest of the site relies on.
 */

const posthog = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))

async function load({ key, server = false }: { key?: string; server?: boolean }) {
  vi.resetModules()
  vi.doMock('@/lib/config', () => ({ isServer: server, posthogId: key }))
  return import('@/lib/posthog-client')
}

beforeEach(() => {
  posthog.init.mockReset()
  posthog.capture.mockReset()
})

afterEach(() => {
  vi.doUnmock('@/lib/config')
  vi.unstubAllEnvs()
})

describe('without a project key', () => {
  it('never initialises and never captures', async () => {
    const client = await load({ key: undefined })

    client.initAnalytics()
    client.capturePageview('https://leothesen.com/')
    client.captureEvent('outbound_click', { href: 'x' })
    client.captureWebVital({ name: 'LCP', value: 1200, id: 'v1', label: 'web-vital' })

    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(client.analyticsEnabled()).toBe(false)
  })
})

describe('on the server', () => {
  it('does nothing even with a key', async () => {
    const client = await load({ key: 'phc_test', server: true })
    client.initAnalytics()
    client.captureEvent('x')
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})

describe('with a project key', () => {
  it('does not capture before initAnalytics has run', async () => {
    const client = await load({ key: 'phc_test' })
    client.captureEvent('early')
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('initialises once, against the EU host by default', async () => {
    const client = await load({ key: 'phc_test' })
    client.initAnalytics()
    client.initAnalytics()

    expect(posthog.init).toHaveBeenCalledTimes(1)
    const [key, options] = posthog.init.mock.calls[0]
    expect(key).toBe('phc_test')
    // A US key against the EU host drops every event silently, so the host is
    // part of the contract rather than an implementation detail.
    expect(options.api_host).toBe('https://eu.i.posthog.com')
    // _app sends pageviews itself; the SDK doing it too would double count.
    expect(options.capture_pageview).toBe(false)
    expect(options.person_profiles).toBe('identified_only')
    expect(options.respect_dnt).toBe(true)
    // Pinned so an SDK upgrade cannot silently change what is measured.
    expect(options.defaults).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('honours NEXT_PUBLIC_POSTHOG_HOST', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com')
    const client = await load({ key: 'phc_test' })
    client.initAnalytics()
    expect(posthog.init.mock.calls[0][1].api_host).toBe('https://us.i.posthog.com')
  })

  it('forwards pageviews, events and web vitals once started', async () => {
    const client = await load({ key: 'phc_test' })
    client.initAnalytics()

    client.capturePageview('https://leothesen.com/ocean')
    client.captureEvent('content_engaged', { path: '/ocean' })
    client.captureWebVital({ name: 'LCP', value: 1234.6, id: 'v1', label: 'web-vital' })
    client.captureWebVital({ name: 'CLS', value: 0.0123, id: 'v2', label: 'web-vital' })

    expect(posthog.capture.mock.calls).toEqual([
      ['$pageview', { $current_url: 'https://leothesen.com/ocean' }],
      ['content_engaged', { path: '/ocean' }],
      // Milliseconds are rounded; CLS is a small unitless ratio and must not be.
      ['web_vital', { metric_name: 'LCP', metric_value: 1235, metric_id: 'v1', metric_label: 'web-vital' }],
      ['web_vital', { metric_name: 'CLS', metric_value: 0.0123, metric_id: 'v2', metric_label: 'web-vital' }],
    ])
    expect(client.analyticsEnabled()).toBe(true)
  })
})
