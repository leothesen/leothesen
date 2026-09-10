import * as React from 'react'
import { GetStaticProps } from 'next'

import { NotionPage } from '@/components/NotionPage'
import { domain, isDev } from '@/lib/config'
import { resolveNotionPageLocal } from '@/lib/resolve-notion-page-local'
import { getAllPages } from '@/lib/notion-local'

export const getStaticProps: GetStaticProps = async (context) => {
  const rawPageId = context.params.pageId as string[]

  try {
    const props = await resolveNotionPageLocal(domain, rawPageId)

    // resolveNotionPageLocal reports a missing page as an `error` prop rather
    // than throwing. Passing that straight through does two wrong things at
    // once: the catch-all answers the path itself, so pages/404.tsx never
    // renders, and the response goes out as a 200, telling crawlers the URL is
    // real. Handing it to Next fixes both.
    if ((props as { error?: { statusCode?: number } }).error?.statusCode === 404) {
      return { notFound: true }
    }

    return { props: JSON.parse(JSON.stringify(props)) }
  } catch (err) {
    console.error('page error', domain, rawPageId, err)
    throw err
  }
}

export async function getStaticPaths() {
  if (isDev) {
    return {
      paths: [],
      fallback: 'blocking',
    }
  }

  const pages = getAllPages()

  return {
    paths: pages.map((page) => ({
      params: { pageId: page.path },
    })),
    // 'blocking' rather than true: an unknown path is resolved on the server, so
    // it can answer 404. With `true` the response is already committed as a 200
    // before getStaticProps has any say.
    fallback: 'blocking',
  }
}

export default function NotionDomainDynamicPage(props) {
  return <NotionPage {...props} />
}
