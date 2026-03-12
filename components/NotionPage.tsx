import * as React from 'react'
import { useRouter } from 'next/router'

import cs from 'classnames'

import * as config from '@/lib/config'
import type { NotionBlock } from '@/lib/notion-api'
import type { Breadcrumb, DatabaseEntry, PageError, Site } from '@/lib/types'
import type { ChildPageInfo } from '@/lib/notion'
import { formatDate } from '@/lib/notion-utils'

import { NotionBlocks } from './NotionRenderer'
import { BlockTableOfContents, extractHeadingsFromBlocks } from './BlockTableOfContents'
import { Footer } from './Footer'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageHead } from './PageHead'

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
    slug: string
    order: number | null
  }
  blocks?: NotionBlock[]
  databaseEntriesMap?: Record<string, DatabaseEntry[]> | null
  childPageMap?: Record<string, ChildPageInfo> | null
  breadcrumbs?: Breadcrumb[]
  pageId?: string
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
  const publishedDate = pageMeta.published

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
      />

      <div className="notion-viewport">
        <NotionPageHeader breadcrumbs={breadcrumbs} />

        {cover && (
          <div className="notion-page-cover-wrapper">
            <img src={cover} alt={title} className="notion-page-cover" />
          </div>
        )}

        <div className="notion-page-layout">
          <main className={cs('notion-page', isRootPage && 'index-page')}>
            <div className="notion-page-content">
              {icon && (
                <div className="notion-page-icon-hero">
                  {icon.startsWith('http') || icon.startsWith('/') ? (
                    <img src={icon} alt="" className="notion-page-icon-image" />
                  ) : (
                    <span className="notion-page-icon-emoji">{icon}</span>
                  )}
                </div>
              )}

              <h1 className="notion-title">{title}</h1>

              {!isRootPage && (publishedDate || pageMeta.lastEdited) && (
                <div className="notion-page-meta">
                  {publishedDate && (
                    <span className="notion-page-date">
                      {formatDate(publishedDate, { month: 'long' })}
                    </span>
                  )}
                  {pageMeta.lastEdited && (
                    <span className="notion-page-date">
                      Last edited {formatDate(pageMeta.lastEdited, { month: 'long' })}
                    </span>
                  )}
                </div>
              )}

              {blocks && (
                <div className="notion-page-body">
                  <NotionBlocks
                    blocks={blocks}
                    databaseEntriesMap={databaseEntriesMap}
                    childPageMap={childPageMap}
                  />
                </div>
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
