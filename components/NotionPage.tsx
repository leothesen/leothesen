import * as React from 'react'
import { useRouter } from 'next/router'

import cs from 'classnames'

import * as config from '@/lib/config'
import { getPageCover, getPageIcon, getPageTitle, getPagePropertyText } from '@/lib/notion-api'
import type { NotionBlock as NotionBlockType } from '@/lib/notion-api'
import type { DatabaseEntry, PageError, Site } from '@/lib/types'
import { useDarkMode } from '@/lib/use-dark-mode'
import { formatDate } from '@/lib/notion-utils'

import { NotionBlocks, DatabaseView } from './NotionRenderer'
import { Footer } from './Footer'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageHead } from './PageHead'

interface NotionPageProps {
  site?: Site
  page?: any
  blocks?: NotionBlockType[]
  databaseEntries?: DatabaseEntry[]
  pageId?: string
  error?: PageError
}

export const NotionPage: React.FC<NotionPageProps> = ({
  site,
  page,
  blocks,
  databaseEntries,
  error,
  pageId,
}) => {
  const router = useRouter()
  const { isDarkMode } = useDarkMode()

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

      <div className={cs('notion-viewport', isDarkMode && 'dark-mode')}>
        <NotionPageHeader />

        <main className={cs('notion-page', isRootPage && 'index-page')}>
          {cover && (
            <div className="notion-page-cover-wrapper">
              <img src={cover} alt={title} className="notion-page-cover" />
            </div>
          )}

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

            {publishedDate && !isRootPage && (
              <div className="notion-page-meta">
                <span className="notion-page-date">
                  {formatDate(publishedDate, { month: 'long' })}
                </span>
              </div>
            )}

            {databaseEntries && databaseEntries.length > 0 && (
              <DatabaseView entries={databaseEntries} mapPageUrl={mapPageUrl} />
            )}

            {blocks && (
              <div className="notion-page-body">
                <NotionBlocks blocks={blocks} mapPageUrl={mapPageUrl} />
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  )
}
