import * as React from 'react'
import type { AppProps, NextWebVitalsMetric } from 'next/app'
import { useRouter } from 'next/router'
import { Inter, Newsreader } from 'next/font/google'

import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import 'styles/global.css'
import 'styles/notion.css'

import { bootstrap } from '@/lib/bootstrap-client'
import { isServer } from '@/lib/config'
import { capturePageview, captureWebVital, initAnalytics } from '@/lib/posthog-client'
import { startContentEngagement, startOutboundClickTracking } from '@/lib/reader-events'

// Self-hosted at build time by next/font, so there is no request to Google and
// no swap flash: the files are served from our own origin with the rest of the
// build. `display: swap` still matters for the first paint before they arrive.
//
// Two faces, with one job each. Newsreader sets titles and headings — it is
// what gives the site a voice instead of the system stack's absence of one.
// Inter does everything that is interface rather than writing: body copy,
// captions, dates, navigation.
const serif = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
})

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Declared on :root rather than on a wrapper element. A wrapper would
          work, but it would also become the containing block for anything that
          later gains a transform, and the fixed header sits inside it. */}
      <style jsx global>{`
        :root {
          --font-sans: ${sans.style.fontFamily};
          --font-serif: ${serif.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
      <Analytics />
    </ThemeProvider>
  )
}
