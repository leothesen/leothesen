import * as React from 'react'
import type { AppProps, NextWebVitalsMetric } from 'next/app'
import { useRouter } from 'next/router'

import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import 'styles/palette.css'
import 'styles/global.css'
import 'styles/notion.css'

import { bootstrap } from '@/lib/bootstrap-client'
import { isServer } from '@/lib/config'
import { capturePageview, captureWebVital, initAnalytics } from '@/lib/posthog-client'
import { THEME_STORAGE_KEY } from '@/lib/theme-choice'
import { startContentEngagement, startOutboundClickTracking } from '@/lib/reader-events'

if (!isServer) {
  bootstrap()
  initAnalytics()
  // One listener for the life of the tab: a click can leave from any page.
  startOutboundClickTracking()
}

export function reportWebVitals(metric: NextWebVitalsMetric) {
  captureWebVital(metric)
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  React.useEffect(() => {
    // The first pageview, plus one per client-side navigation. Pages Router
    // does not emit these on its own.
    capturePageview(window.location.href)

    const onRouteChange = (url: string) => {
      capturePageview(window.location.origin + url)
    }
    router.events.on('routeChangeComplete', onRouteChange)
    return () => router.events.off('routeChangeComplete', onRouteChange)
  }, [router.events])

  // Scroll depth and dwell belong to a page, not to the tab, so this restarts
  // on every navigation. `asPath` rather than `pathname`, which is the
  // unresolved `/[...pageId]` for every article on the site.
  React.useEffect(() => {
    return startContentEngagement(window.location.pathname)
  }, [router.asPath])

  return (
    // System is the default for anyone who has not chosen. Switching themes
    // turns transitions off for that one frame, so the site's hover and
    // blur-up transitions do not all animate from the old colours at once.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <Component {...pageProps} />
      <Analytics />
    </ThemeProvider>
  )
}
