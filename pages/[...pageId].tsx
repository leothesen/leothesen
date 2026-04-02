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
    return { props: JSON.parse(JSON.stringify(props)) }
  } catch (err) {
    console.error('page error', domain, rawPageId, err)
    return { notFound: true }
  }
}

export async function getStaticPaths() {
  if (isDev) {
    return {
      paths: [],
      fallback: true,
    }
  }

  const pages = getAllPages()

  return {
    paths: pages.map((page) => ({
      params: { pageId: page.path },
    })),
    fallback: true,
  }
}

export default function NotionDomainDynamicPage(props) {
  return <NotionPage {...props} />
}
