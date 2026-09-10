import { captureEvent } from './posthog-client'

/**
 * The two things a reader does that a pageview cannot see.
 *
 * A pageview says a page loaded. It cannot say whether the page was read or
 * abandoned, and it cannot say which link carried someone off the site. Those
 * are the only two questions this site's traffic actually raises: over the 18
 * months of data before collection stopped, 1,377 people reached the home page
 * and 68 reached the most-read piece of writing.
 *
 * The previous attempt at this used PostHog Actions matched on CSS selectors
 * (`.notion-page [class^="PageSocial_github"]`). Those were hashed CSS-module
 * class names, so the March 2026 renderer rebuild silently killed six of the
 * seven — the Actions stayed green in the UI and matched nothing ever again.
 * Capturing from the DOM contract we control avoids repeating that.
 */

// A read is deliberately not "the page loaded and something scrolled". Half the
// article and twenty seconds is a low bar, but it is a bar, and it separates a
// reader from a bounce without pretending to measure comprehension.
const READ_SCROLL_FRACTION = 0.5
const READ_DWELL_MS = 20_000

type Teardown = () => void

function outboundClicks(): Teardown {
  const onClick = (event: MouseEvent) => {
    // Ignore anything the browser will not treat as a plain navigation.
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const anchor = (event.target as Element | null)?.closest?.('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return

    let url: URL
    try {
      url = new URL(anchor.href, window.location.href)
    } catch {
      return
    }

    // Only http(s) leaving this origin. mailto: and tel: are not navigations
    // and same-host links are internal even when written as absolute URLs —
    // which most of the cross-links in the Notion content still are.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (url.host === window.location.host) return

    captureEvent('outbound_click', {
      href: url.href,
      host: url.host,
      // Trimmed rather than sent whole: a linked image or card has no useful
      // text and could otherwise send a paragraph.
      link_text: (anchor.textContent || '').trim().slice(0, 80) || null,
      from_path: window.location.pathname,
    })
  }

  // Capture phase, so a handler that stops propagation cannot hide the click.
  document.addEventListener('click', onClick, { capture: true })
  return () => document.removeEventListener('click', onClick, { capture: true })
}

function contentEngagement(path: string): Teardown {
  const startedAt = Date.now()
  let deepest = 0
  let sent = false
  let frame = 0

  const measure = () => {
    frame = 0
    const viewport = window.innerHeight
    const total = document.documentElement.scrollHeight
    // A page shorter than the viewport is fully visible, so scrolling can never
    // register — treat it as read in full rather than never read.
    const fraction = total <= viewport ? 1 : (window.scrollY + viewport) / total
    deepest = Math.min(1, Math.max(deepest, fraction))
    maybeSend()
  }

  const onScroll = () => {
    // Coalesce to one measurement per frame; scroll fires far more often.
    if (frame) return
    frame = window.requestAnimationFrame(measure)
  }

  const maybeSend = () => {
    if (sent) return
    const seconds = (Date.now() - startedAt) / 1000
    if (deepest < READ_SCROLL_FRACTION || seconds * 1000 < READ_DWELL_MS) return
    sent = true
    captureEvent('content_engaged', {
      path,
      scroll_depth: Math.round(deepest * 100),
      seconds: Math.round(seconds),
    })
  }

  // Dwell alone can satisfy the threshold on a page already scrolled past half,
  // so the clock needs its own wake-up rather than waiting for another scroll.
  const timer = window.setTimeout(measure, READ_DWELL_MS)

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  measure()

  return () => {
    window.clearTimeout(timer)
    if (frame) window.cancelAnimationFrame(frame)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
}

/**
 * Starts the outbound-click listener. Lives for the life of the tab, because a
 * click can land on any page.
 */
export function startOutboundClickTracking(): Teardown {
  if (typeof document === 'undefined') return () => {}
  return outboundClicks()
}

/**
 * Starts engagement tracking for one page. The caller re-runs this per
 * client-side navigation, so the scroll depth and clock belong to that page
 * rather than to the tab.
 */
export function startContentEngagement(path: string): Teardown {
  if (typeof window === 'undefined') return () => {}
  return contentEngagement(path)
}
