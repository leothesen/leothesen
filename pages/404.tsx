import type { GetStaticProps } from 'next'

import { Page404 } from '@/components/Page404'
import { getManifest } from '@/lib/notion-local'

/**
 * The 404 page is where mistyped and stale links land, so it offers somewhere
 * to go next. Sections come from the manifest rather than a hardcoded list, so
 * they follow Notion.
 *
 * Read inline rather than through a shared helper to keep this page
 * independent of the header-navigation work in #95.
 */
export const getStaticProps: GetStaticProps = async () => {
  const manifest = getManifest()
  const sections = Object.entries(manifest.slugTree).map(([slug, node]) => ({
    title: node.title.trim(),
    path: `/${slug}`,
  }))

  return { props: { sections } }
}

export default Page404
