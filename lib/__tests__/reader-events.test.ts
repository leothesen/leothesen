// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startContentEngagement, startOutboundClickTracking } from '@/lib/reader-events'

const captureEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/posthog-client', () => ({ captureEvent }))

/**
 * The two custom events are the only analytics this site has beyond
 * pageviews, and both replaced PostHog Actions that died silently when CSS
 * class names changed. So the thing to pin down is when they fire and, just as
 * much, when they must not.
 */

describe('outbound click tracking', () => {
  let stop: () => void

  beforeEach(() => {
    captureEvent.mockReset()
    document.body.innerHTML = ''
    stop = startOutboundClickTracking()
  })

  afterEach(() => stop())

  function link(href: string, text = 'a link') {
    const a = document.createElement('a')
    a.href = href
    a.innerHTML = `<span>${text}</span>`
    // jsdom would try to navigate; the listener runs in the capture phase
    // before this, so preventing it here does not hide the click from it.
    a.addEventListener('click', (e) => e.preventDefault())
    document.body.appendChild(a)
    return a
  }

  it('reports a plain click on a link to another site', () => {
    link('https://github.com/leothesen', 'GitHub').querySelector('span')!.click()

    expect(captureEvent).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith('outbound_click', {
      href: 'https://github.com/leothesen',
      host: 'github.com',
      link_text: 'GitHub',
      from_path: window.location.pathname,
    })
  })

  it('ignores same-host links, even written as absolute URLs', () => {
    // Most of the Notion cross-links used to be absolute leothesen.com URLs.
    link(`${window.location.origin}/ocean`).click()
    link('/mountains').click()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('ignores mailto: and tel:', () => {
    link('mailto:leo@example.com').click()
    link('tel:+27210000000').click()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('ignores modified and non-primary clicks', () => {
    const a = link('https://example.com')
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
    }
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('still sees a click whose handler stops propagation', () => {
    const a = link('https://example.com')
    a.addEventListener('click', (e) => e.stopPropagation())
    a.click()
    expect(captureEvent).toHaveBeenCalledTimes(1)
  })

  it('trims long link text and sends null for a link with none', () => {
    link('https://example.com/a', 'x'.repeat(200)).click()
    link('https://example.com/b', '   ').click()

    expect(captureEvent.mock.calls[0][1].link_text).toHaveLength(80)
    expect(captureEvent.mock.calls[1][1].link_text).toBeNull()
  })

  it('stops listening after teardown', () => {
    stop()
    link('https://example.com').click()
    expect(captureEvent).not.toHaveBeenCalled()
  })
})

describe('content engagement', () => {
  let stop: () => void

  function setPage({ viewport, total, scrollY = 0 }: { viewport: number; total: number; scrollY?: number }) {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport })
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: total })
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: scrollY })
  }

  function scrollTo(y: number) {
    ;(window as any).scrollY = y
    window.dispatchEvent(new Event('scroll'))
    // Measurements are coalesced to animation frames.
    vi.advanceTimersToNextFrame()
  }

  beforeEach(() => {
    captureEvent.mockReset()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    stop?.()
    vi.useRealTimers()
  })

  it('does not count a bounce: scrolled deep but left within 20 seconds', () => {
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')

    scrollTo(3200)
    vi.advanceTimersByTime(19_000)
    scrollTo(3200)

    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('does not count a reader who stayed but never reached halfway', () => {
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')

    scrollTo(800) // (800 + 800) / 4000 = 40%
    vi.advanceTimersByTime(60_000)

    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('fires once when a reader who crossed halfway early reaches 20 seconds', () => {
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')

    scrollTo(1000) // (1000 + 800) / 4000 = 45%
    vi.advanceTimersByTime(10_000)
    scrollTo(1400) // 55%
    vi.advanceTimersByTime(10_000)

    expect(captureEvent).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith('content_engaged', {
      path: '/ocean/long-read',
      scroll_depth: 55,
      seconds: 20,
    })

    // Once per page view, however much more they read.
    scrollTo(3200)
    vi.advanceTimersByTime(60_000)
    expect(captureEvent).toHaveBeenCalledTimes(1)
  })

  it('fires on the scroll that crosses halfway when dwell was met first', () => {
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')

    vi.advanceTimersByTime(30_000)
    expect(captureEvent).not.toHaveBeenCalled()

    scrollTo(1400)
    expect(captureEvent).toHaveBeenCalledWith('content_engaged', {
      path: '/ocean/long-read',
      scroll_depth: 55,
      seconds: 30,
    })
  })

  it('fires on dwell alone once the reader is already past halfway', () => {
    // Nothing scrolls after the threshold is crossed, so the 20s timer is the
    // only thing that can send it.
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')
    scrollTo(2400)

    vi.advanceTimersByTime(20_000)

    expect(captureEvent).toHaveBeenCalledTimes(1)
    expect(captureEvent.mock.calls[0][1]).toMatchObject({ scroll_depth: 80, seconds: 20 })
  })

  it('treats a page shorter than the viewport as read in full', () => {
    setPage({ viewport: 900, total: 600 })
    stop = startContentEngagement('/get-in-touch')

    vi.advanceTimersByTime(20_000)

    expect(captureEvent).toHaveBeenCalledWith('content_engaged', {
      path: '/get-in-touch',
      scroll_depth: 100,
      seconds: 20,
    })
  })

  it('sends nothing after teardown, as on a client-side navigation away', () => {
    setPage({ viewport: 800, total: 4000 })
    stop = startContentEngagement('/ocean/long-read')
    scrollTo(3200)

    stop()
    vi.advanceTimersByTime(60_000)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersToNextFrame()

    expect(captureEvent).not.toHaveBeenCalled()
  })
})
