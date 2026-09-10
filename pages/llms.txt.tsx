import type { GetServerSideProps } from 'next'

import * as config from '@/lib/config'
import { getManifest } from '@/lib/notion-local'

interface Node {
  pageId: string
  title: string
  children: Record<string, Node>
}

/**
 * llms.txt — a plain-text map of the site for language models.
 *
 * Generated from the manifest rather than hand-written, so it cannot drift
 * from what is actually published. Grouped by top-level section, because a
 * flat list of 215 URLs tells a reader nothing about how the site is shaped.
 *
 * Format follows llmstxt.org: an H1, a blockquote summary, then H2 sections
 * of markdown links.
 */
function buildLlmsTxt(): string {
  const manifest = getManifest()
  const lines: string[] = [
    `# ${config.name}`,
    '',
    `> ${config.description}`,
    '',
    'A personal digital garden: long-form writing about surfing and the ocean,',
    'mountains and trail running, engineering, and travel. Everything here is',
    'written by Leo Thesen and published from Notion.',
    '',
  ]

  const walk = (nodes: Record<string, Node>, prefix: string[], out: string[]) => {
    for (const [slug, node] of Object.entries(nodes)) {
      const path = [...prefix, slug]
      const title = node.title.trim()
      // Indent by depth so nesting survives into plain text.
      out.push(`${'  '.repeat(path.length - 1)}- [${title}](${config.host}/${path.join('/')})`)
      walk(node.children, path, out)
    }
  }

  for (const [slug, node] of Object.entries(manifest.slugTree)) {
    const section: string[] = []
    walk(node.children, [slug], section)

    lines.push(`## ${node.title.trim()}`)
    lines.push('')
    lines.push(`- [${node.title.trim()}](${config.host}/${slug})`)
    lines.push(...section)
    lines.push('')
  }

  lines.push('## Feeds')
  lines.push('')
  lines.push(`- [RSS](${config.host}/feed)`)
  lines.push(`- [Sitemap](${config.host}/sitemap.xml)`)
  lines.push('')

  return lines.join('\n')
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({ error: 'method not allowed' }))
    res.end()
    return { props: {} }
  }

  // Changes only on a redeploy.
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.write(buildLlmsTxt())
  res.end()

  return { props: {} }
}

export default () => null
