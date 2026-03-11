import * as React from 'react'
import { useRouter } from 'next/router'

import cs from 'classnames'

import * as config from '@/lib/config'
import { getPageCover, getPageIcon, getPageTitle, getPagePropertyText } from '@/lib/notion-api'
import type { NotionBlock as NotionBlockType } from '@/lib/notion-api'
import type { ChildPageInfo } from '@/lib/notion'
import type { Breadcrumb, DatabaseEntry, PageError, Site } from '@/lib/types'
import { formatDate } from '@/lib/notion-utils'

import { NotionBlocks } from './NotionRenderer'
import { TableOfContents } from './TableOfContents'
import { Footer } from './Footer'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageHead } from './PageHead'

interface NotionPageProps {
  site?: Site
  page?: any
  blocks?: NotionBlockType[]
  databaseEntriesMap?: Record<string, DatabaseEntry[]> | null
  childPageMap?: Record<string, ChildPageInfo> | null
  breadcrumbs?: Breadcrumb[]
  pageId?: string
  error?: PageError
}

export const NotionPage: React.FC<NotionPageProps> = ({
  site,
  page,
  blocks,
  databaseEntriesMap,
  childPageMap,
  breadcrumbs,
  error,
  pageId,
}) => {
  const router = useRouter()

  const mapPageUrl = React.useCallback(
    (slugOrId: string) => `/${slugOrId}`,
    []
  )

  if (router.isFallback) {
    return <Loading />
  }

  if (error || !site || !page) {
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  const title = getPageTitle(page) || site.name
  const cover = getPageCover(page)
  const icon = getPageIcon(page)
  const description = getPagePropertyText(page, 'Description') || config.description
  const isRootPage = pageId === site.rootNotionPageId
  const publishedDate = getPagePropertyText(page, 'Published')

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
                  {icon.startsWith('http') ? (
                    <img src={icon} alt="" className="notion-page-icon-image" />
                  ) : (
                    <span className="notion-page-icon-emoji">{icon}</span>
                  )}
                </div>
              )}

              <h1 className="notion-title">{title}</h1>

              {!isRootPage && (publishedDate || page.last_edited_time) && (
                <div className="notion-page-meta">
                  {publishedDate && (
                    <span className="notion-page-date">
                      {formatDate(publishedDate, { month: 'long' })}
                    </span>
                  )}
                  {page.last_edited_time && (
                    <span className="notion-page-date">
                      Last edited {formatDate(page.last_edited_time, { month: 'long' })}
                    </span>
                  )}
                </div>
              )}

              {blocks && (
                <div className="notion-page-body">
                  <NotionBlocks
                    blocks={blocks}
                    mapPageUrl={mapPageUrl}
                    databaseEntriesMap={databaseEntriesMap}
                    childPageMap={childPageMap}
                  />
                </div>
              )}
            </div>
          </main>

          {blocks && !isRootPage && (
            <TableOfContents blocks={blocks} />
          )}
        </div>

        <Footer />
      </div>
    </>
  )
}
