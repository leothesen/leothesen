import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Image from 'next/image'

import cs from 'classnames'

import * as config from '@/lib/config'
import type { NotionBlock } from '@/lib/notion-api'
import type { Breadcrumb, DatabaseEntry, PageError, Site } from '@/lib/types'
import type { ChildPageInfo } from '@/lib/notion'
import type { PageNeighbour } from '@/lib/resolve-notion-page-local'
import { formatDate } from '@/lib/notion-utils'

import { HeadingOffsetProvider, NotionBlocks } from './NotionRenderer'
import { BlockTableOfContents, extractHeadingsFromBlocks } from './BlockTableOfContents'
import { Footer } from './Footer'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PhotoLightbox } from './PhotoLightbox'
import { PageHead } from './PageHead'

// Matches the 80px `.notion-page-icon-image` is drawn at in notion.css. It is
// what next/image resizes to, so the two have to agree or we ship the wrong
// number of pixels; next/image asks for 2x on top of this for retina.
const ICON_SIZE = 80

/**
 * How many photographs are on this page.
 *
 * Shown beside the date because it is the most useful single thing you can say
 * about a page on this site before opening it: 1,038 of the blocks here are
 * images, and "23 photos" separates a photo essay from a paragraph of notes at
 * a glance. Counted from the blocks rather than stored, so it cannot drift.
 */
function countImages(blocks: NotionBlock[] | undefined): number {
  let total = 0
  const walk = (list: NotionBlock[] | undefined) => {
    for (const block of list || []) {
      if (block.type === 'image') total++
      if ((block as any).children) walk((block as any).children)
    }
  }
  walk(blocks)
  return total
}

interface NotionPageProps {
  site?: Site
  pageMeta?: {
    id: string
    title: string
    icon: string | null
    cover: string | null
    description: string | null
    published: string | null
    author: string | null
    lastEdited: string
    // Notion's own creation time. Written to every meta.json by the sync and
    // already handed to this component inside pageMeta — it had simply never
    // been declared here, so nothing could read it.
    created?: string | null
    slug: string
    order: number | null
  }
  blocks?: NotionBlock[]
  databaseEntriesMap?: Record<string, DatabaseEntry[]> | null
  childPageMap?: Record<string, ChildPageInfo> | null
  breadcrumbs?: Breadcrumb[]
  pageId?: string
  readingMinutes?: number | null
  neighbours?: { prev: PageNeighbour | null; next: PageNeighbour | null }
  canonicalPath?: string
  error?: PageError
}

export const NotionPage: React.FC<NotionPageProps> = ({
  site,
  pageMeta,
  blocks,
  databaseEntriesMap,
  childPageMap,
  breadcrumbs,
  error,
  pageId,
  readingMinutes,
  neighbours,
  canonicalPath,
}) => {
  const router = useRouter()

  if (router.isFallback) {
    return <Loading />
  }

  if (error || !site || !pageMeta) {
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  const title = pageMeta.title || site.name
  const cover = pageMeta.cover
  const icon = pageMeta.icon
  const description = pageMeta.description || config.description
  const isRootPage = pageId === site.rootNotionPageId

  /*
   * When this happened — not when it was last touched.
   *
   * The header used to read "Last edited <date>", and that date is a sync
   * artifact rather than a fact about the page: 50 of the 217 pages share a
   * lastEdited of 2026-03-13 from one bulk edit, so on 50 pages it told the
   * reader the same meaningless thing. `created` is populated on all 217 and
   * spreads over 2021-2026 — for a journal it is the only date that means
   * anything. archive.tsx already argued exactly this and switched; the page
   * header had never caught up.
   *
   * `lastEdited` is not lost: PageHead still emits it as the article's
   * modifiedTime, which is where a crawler wants it and a reader does not.
   */
  const writtenDate = pageMeta.published || pageMeta.created || null
  const photoCount = React.useMemo(() => countImages(blocks), [blocks])

  const headings = React.useMemo(
    () => blocks ? extractHeadingsFromBlocks(blocks) : [],
    [blocks]
  )

  return (
    <>
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={description}
        image={cover}
        url={canonicalPath ? `${config.host}${canonicalPath}` : undefined}
        isArticle={!isRootPage}
        publishedTime={writtenDate || pageMeta.lastEdited || undefined}
        modifiedTime={pageMeta.lastEdited || undefined}
      />

      <div className="notion-viewport">
        {/* First focusable thing on the page. Without it, reaching the article
            means tabbing through the breadcrumb and every child-page link —
            on a gallery page that is dozens of stops. */}
        <a href="#notion-content" className="notion-skip-link">
          Skip to content
        </a>

        <NotionPageHeader breadcrumbs={breadcrumbs} />

        {cover && (
          <div className="notion-page-cover-wrapper">
            <Image
              src={cover}
              alt={title}
              // The cover is the largest thing above the fold, so it is the LCP
              // element on every page: it loads eagerly rather than lazily.
              priority
              fill
              sizes="100vw"
              className="notion-page-cover notion-image-loading"
              onLoad={(e) => e.currentTarget.classList.remove('notion-image-loading')}
            />
          </div>
        )}

        <div className="notion-page-layout">
          {/* tabIndex -1 so the skip link can move focus here, not just scroll:
              without it the next Tab would start from the top again. */}
          <main
            id="notion-content"
            tabIndex={-1}
            className={cs('notion-page', isRootPage && 'index-page')}
          >
            <div className="notion-page-content">
              {icon && (
                <div className="notion-page-icon-hero">
                  {icon.startsWith('http') || icon.startsWith('/') ? (
                    // Every other image on the site goes through next/image;
                    // this one used to be a bare <img>, and both of the ways
                    // that hurt showed up on the live site.
                    //
                    // The blur class below ships in the server-rendered HTML,
                    // and only `onLoad` takes it off again. A bare <img> that
                    // finished before React hydrated had already fired `load`,
                    // so nothing ever removed it and the icon sat there
                    // permanently blurred — until a client-side navigation
                    // re-rendered it and the handler was attached in time.
                    // next/image checks `img.complete` on mount for exactly
                    // this, and re-assigns `src` when an `onError` is given so
                    // a pre-hydration failure is not lost either.
                    //
                    // It also resizes: the avatar behind this is a 1.1MB PNG
                    // drawn into 80 square pixels, above the fold, on the same
                    // connection as the LCP cover.
                    <Image
                      src={icon}
                      alt=""
                      width={ICON_SIZE}
                      height={ICON_SIZE}
                      // Directly under the cover, so it is in the first
                      // viewport of every page — never worth deferring.
                      priority
                      className="notion-page-icon-image notion-image-loading"
                      onLoad={(e) => e.currentTarget.classList.remove('notion-image-loading')}
                      // Notion's signed icon URLs expire. Un-blur on failure
                      // too, so a dead one is an absent icon rather than a
                      // permanent smudge.
                      onError={(e) => e.currentTarget.classList.remove('notion-image-loading')}
                    />
                  ) : (
                    <span className="notion-page-icon-emoji">{icon}</span>
                  )}
                </div>
              )}

              <h1 className="notion-title">{title}</h1>

              {!isRootPage && (writtenDate || readingMinutes || photoCount > 0) && (
                <div className="notion-page-meta">
                  {writtenDate && (
                    <time className="notion-page-date notion-page-date-primary" dateTime={writtenDate}>
                      {formatDate(writtenDate, { month: 'long' })}
                    </time>
                  )}
                  {readingMinutes && (
                    <span className="notion-page-date">{readingMinutes} min read</span>
                  )}
                  {photoCount > 0 && (
                    <span className="notion-page-date">
                      {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                    </span>
                  )}
                </div>
              )}

              {blocks && (
                <PhotoLightbox className="notion-page-body">
                  <HeadingOffsetProvider blocks={blocks}>
                    <NotionBlocks
                      blocks={blocks}
                      databaseEntriesMap={databaseEntriesMap}
                      childPageMap={childPageMap}
                    />
                  </HeadingOffsetProvider>
                </PhotoLightbox>
              )}

              {!isRootPage && (neighbours?.prev || neighbours?.next) && (
                <nav className="notion-page-neighbours" aria-label="Nearby pages">
                  {neighbours.prev ? (
                    <Link href={neighbours.prev.path} className="notion-neighbour notion-neighbour-prev">
                      <span className="notion-neighbour-label">Previous</span>
                      <span className="notion-neighbour-title">{neighbours.prev.title}</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {neighbours.next && (
                    <Link href={neighbours.next.path} className="notion-neighbour notion-neighbour-next">
                      <span className="notion-neighbour-label">Next</span>
                      <span className="notion-neighbour-title">{neighbours.next.title}</span>
                    </Link>
                  )}
                </nav>
              )}
            </div>
          </main>

          {blocks && !isRootPage && (
            <BlockTableOfContents headings={headings} />
          )}
        </div>

        <Footer />
      </div>
    </>
  )
}
