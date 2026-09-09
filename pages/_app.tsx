import * as React from 'react'
import type { AppProps } from 'next/app'

import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import 'styles/global.css'
import 'styles/notion.css'
// Art direction, loaded last so it can override the base. Delete this one
// import to drop the whole treatment.
import 'styles/theme-editorial.css'

import { bootstrap } from '@/lib/bootstrap-client'
import { isServer } from '@/lib/config'
import { inter } from '@/lib/fonts'

if (!isServer) {
  bootstrap()
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Publishes --font-inter globally without wrapping the page in a div. */}
      <style jsx global>{`
        :root {
          --font-inter: ${inter.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
      <Analytics />
    </ThemeProvider>
  )
}
