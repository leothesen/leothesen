import * as React from 'react'
import type { AppProps } from 'next/app'

import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import 'styles/global.css'
import 'styles/notion.css'

import { bootstrap } from '@/lib/bootstrap-client'
import { isServer } from '@/lib/config'

if (!isServer) {
  bootstrap()
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Component {...pageProps} />
      <Analytics />
    </ThemeProvider>
  )
}
