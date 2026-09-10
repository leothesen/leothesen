import * as React from 'react'
import type { AppProps, NextWebVitalsMetric } from 'next/app'
import { useRouter } from 'next/router'

import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import 'styles/global.css'
import 'styles/notion.css'

import { bootstrap } from '@/lib/bootstrap-client'
import { isServer } from '@/lib/config'
import { capturePageview, captureWebVital, initAnalytics } from '@/lib/posthog-client'

if (!isServer) {
  bootstrap()
  initAnalytics()
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

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Component {...pageProps} />
      <Analytics />
    </ThemeProvider>
  )
}
