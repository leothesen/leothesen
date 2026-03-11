import * as React from 'react'

import { PageSocial } from './PageSocial'

export const PageAside: React.FC<{
  isBlogPost: boolean
}> = ({ isBlogPost }) => {
  if (isBlogPost) {
    return null
  }

  return <PageSocial />
}
