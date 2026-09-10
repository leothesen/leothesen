import posthog from 'posthog-js'

import { isServer, posthogId } from './config'

// Both of Leo's other PostHog orgs are on EU cloud, so that is the default.
// Override with NEXT_PUBLIC_POSTHOG_HOST if this site's project lives elsewhere.
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

let started = false

/**
 * Starts PostHog, but only when a project key is configured.
 *
 * `posthogId` has been exported from config since the site was built and read
 * by nothing, so analytics has never actually run. Without a key this stays a
 * no-op: no script, no requests, no console noise.
 */
export function initAnalytics(): void {
  if (isServer || started || !posthogId) return
  started = true

  posthog.init(posthogId, {
    api_host: apiHost,
    // Where the PostHog app itself lives, as opposed to where events are sent.
    // Only diverges once a reverse proxy is pointed at api_host, but setting it
    // now means the toolbar's links do not break when that happens.
    ui_host: 'https://eu.posthog.com',

    // Opt into the SDK's dated defaults rather than inheriting "unset", which
    // is every legacy behaviour posthog-js has ever shipped. Four of the ten
    // things this flips matter here:
    //
    //   internal_or_test_user_hostname  flags localhost traffic as internal, so
    //                                   local development stops polluting real data
    //   disable_capture_url_hashes      strips #fragments from $current_url; the
    //                                   table of contents links to #<block-id>, so
    //                                   without it one article splits into many URLs
    //   rageclick.ignore_text_selection stops counting "selected some text to quote
    //                                   it" as rage — common on a site people read
    //   detect_google_search_app        attributes the Google app's in-app browser
    //                                   instead of filing it under direct traffic
    //
    // Pinned to a date rather than tracking latest: a version bump must not
    // silently change what is measured.
    defaults: '2026-08-30',

    // Deliberately overriding what `defaults` would set here.
    //
    // From 2025-05-24 the recommended value is 'history_change', which infers
    // pageviews from the browser history API. This is the Pages Router, where
    // `routeChangeComplete` is the authoritative signal, and posthog-js has an
    // open report of 'history_change' double-firing (PostHog/posthog-js#3591).
    // Sending them ourselves from _app is verified to produce exactly one
    // pageview per navigation, so it stays.
    capture_pageview: false,

    // A personal site has no accounts to tie events to, so don't create a
    // person profile for every anonymous reader.
    person_profiles: 'identified_only',
    respect_dnt: true,
  })
}

export function capturePageview(url: string): void {
  if (!analyticsEnabled()) return
  posthog.capture('$pageview', { $current_url: url })
}

export function captureWebVital(metric: {
  name: string
  value: number
  id: string
  label: string
}): void {
  if (!analyticsEnabled()) return
  posthog.capture('web_vital', {
    metric_name: metric.name,
    // CLS is a unitless ratio; every other metric is milliseconds.
    metric_value: metric.name === 'CLS' ? metric.value : Math.round(metric.value),
    metric_id: metric.id,
    metric_label: metric.label,
  })
}

/**
 * Sends a custom event, or nothing at all when analytics is off.
 *
 * Every caller goes through here rather than importing posthog directly, so
 * that a site running without a key stays a genuine no-op.
 */
export function captureEvent(name: string, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled()) return
  posthog.capture(name, properties)
}

export function analyticsEnabled(): boolean {
  return !isServer && !!posthogId && started
}
