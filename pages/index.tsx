import * as React from 'react'

import { NotionPage } from '@/components/NotionPage'
import { domain } from '@/lib/config'
import { resolveNotionPageLocal } from '@/lib/resolve-notion-page-local'

export const getStaticProps = async () => {
  try {
    const props = await resolveNotionPageLocal(domain)
    return { props: JSON.parse(JSON.stringify(props)) }
  } catch (err) {
    console.error('page error', domain, err)
    throw err
  }
}

export default function NotionDomainPage(props) {
  return <NotionPage {...props} />
}
