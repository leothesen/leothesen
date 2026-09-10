import * as React from 'react'
import Document, { Head, Html, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang='en' suppressHydrationWarning>
        <Head>
          <link rel='shortcut icon' href='/favicon.ico' />
          {/* Leading slash matters: written relative, a page at
              /novel-experiences/sabbatical asked for
              /novel-experiences/sabbatical/favicon.png, which the catch-all
              route answered with 4.4KB of HTML instead of a 32px icon. */}
          <link
            rel='icon'
            type='image/png'
            sizes='32x32'
            href='/favicon.png'
          />
          <link
            rel='icon'
            type='image/png'
            sizes='192x192'
            href='/favicon-192x192.png'
          />
          <link rel='apple-touch-icon' href='/favicon-192x192.png' />
          <link rel='manifest' href='/manifest.json' />
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
