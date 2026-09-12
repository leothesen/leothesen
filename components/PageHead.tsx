import * as React from 'react'
import Head from 'next/head'

import * as config from '@/lib/config'
import { getSocialImageUrl } from '@/lib/get-social-image-url'
import type { Site } from '@/lib/types'

/**
 * Schema.org description of the page, as a JSON-LD string.
 *
 * Returns null rather than a half-filled graph when there is no canonical URL
 * to anchor it to — an Article with no `mainEntityOfPage` is not much use to a
 * crawler, and an empty one is worse than none.
 */
function buildStructuredData({
  isArticle,
  title,
  description,
  url,
  image,
  publishedTime,
  modifiedTime,
  siteName,
}: {
  isArticle?: boolean
  title?: string
  description?: string
  url?: string
  image?: string
  publishedTime?: string
  modifiedTime?: string
  siteName?: string
}): string | null {
  if (!url || !title) return null

  const author = {
    '@type': 'Person',
    name: siteName || config.author,
    url: config.host,
  }

  const data = isArticle
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        ...(description ? { description } : {}),
        ...(image ? { image: [image] } : {}),
        ...(publishedTime ? { datePublished: publishedTime } : {}),
        ...(modifiedTime ? { dateModified: modifiedTime } : {}),
        author,
        publisher: author,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteName || config.name,
        ...(description ? { description } : {}),
        url: config.host,
        author,
      }

  // `<` is the only character that can break out of a <script> block; escaping
  // it keeps this safe whatever a Notion page is titled.
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export const PageHead: React.FC<{
  site?: Site
  title?: string
  description?: string
  image?: string
  url?: string
  pageId?: string
  /** Content pages are articles; the home page is not. */
  isArticle?: boolean
  publishedTime?: string
  modifiedTime?: string
  noindex?: boolean
}> = ({
  site,
  title,
  description,
  pageId,
  image,
  url,
  isArticle,
  publishedTime,
  modifiedTime,
  noindex,
}) => {
  const rssFeedUrl = `${config.host}/feed`

  title = title ?? site?.name
  description = description ?? site?.description

  const socialImageUrl = getSocialImageUrl(pageId) || image

  const structuredData = buildStructuredData({
    isArticle,
    title,
    description,
    url,
    image: socialImageUrl,
    publishedTime,
    modifiedTime,
    siteName: site?.name,
  })

  return (
    <Head>
      <meta charSet='utf-8' />
      <meta httpEquiv='Content-Type' content='text/html; charset=utf-8' />
      <meta
        name='viewport'
        content='width=device-width, initial-scale=1, shrink-to-fit=no'
      />

      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6" key="theme-color-light" />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f0e0c" key="theme-color-dark" />

      <meta property='og:type' content={isArticle ? 'article' : 'website'} />

      {isArticle && (
        <>
          {publishedTime && (
            <meta property='article:published_time' content={publishedTime} />
          )}
          {modifiedTime && (
            <meta property='article:modified_time' content={modifiedTime} />
          )}
          {site?.name && (
            <meta property='article:author' content={site.name} />
          )}
        </>
      )}

      {structuredData && (
        <script
          type='application/ld+json'
          // JSON only, escaped so a "</script>" in a page title cannot close
          // the tag early.
          dangerouslySetInnerHTML={{ __html: structuredData }}
        />
      )}
      <meta
        name='robots'
        content={noindex ? 'noindex,follow' : 'index,follow'}
      />

      {site && (
        <>
          <meta property='og:site_name' content={site.name} />
          <meta name="author" content={site.name} />
          <meta property='twitter:domain' content={site.domain} />
        </>
      )}

      {config.twitter && (
        <meta name='twitter:creator' content={`@${config.twitter}`} />
      )}

      {description && (
        <>
          <meta name='description' content={description} />
          <meta property='og:description' content={description} />
          <meta name='twitter:description' content={description} />
        </>
      )}

      {socialImageUrl ? (
        <>
          <meta name='twitter:card' content='summary_large_image' />
          <meta name='twitter:image' content={socialImageUrl} />
          <meta property='og:image' content={socialImageUrl} />
        </>
      ) : (
        <meta name='twitter:card' content='summary' />
      )}

      {url && (
        <>
          <link rel='canonical' href={url} />
          <meta property='og:url' content={url} />
          <meta property='twitter:url' content={url} />
        </>
      )}

      <link
        rel='alternate'
        type='application/rss+xml'
        href={rssFeedUrl}
        title={site?.name}
      />

      <meta property='og:title' content={title} />
      <meta name='twitter:title' content={title} />
      <title>{title}</title>
    </Head>
  )
}
