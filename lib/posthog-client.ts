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
    // Pages Router: route changes are client-side, so pageviews are sent from
    // the router event in _app rather than guessed from history.
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

export function analyticsEnabled(): boolean {
  return !isServer && !!posthogId && started
}
