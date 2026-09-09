import * as React from 'react'
import * as fs from 'fs'
import * as path from 'path'
import Link from 'next/link'
import type { GetStaticProps } from 'next'

import * as config from '@/lib/config'
import { getAllPages, getManifest } from '@/lib/notion-local'
import { Footer } from '@/components/Footer'
import { NotionPageHeader } from '@/components/NotionPageHeader'
import { PageHead } from '@/components/PageHead'

interface Entry {
  title: string
  path: string
  section: string
  date: string
  day: string
}

interface Props {
  years: { year: string; entries: Entry[] }[]
  total: number
}

/** `published` where a page has one, `lastEdited` otherwise. */
function readPageDate(pageId: string): string | null {
  const metaPath = path.join(process.cwd(), '.content', 'pages', pageId, 'meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    return meta.published || meta.lastEdited || null
  } catch {
    return null
  }
}

/**
 * Everything on the site, newest first.
 *
 * 216 pages spread over five years and there was no way to see them in the
 * order they were written — only by browsing down into sections. Dates come
 * from each page's meta.json: `published` where it exists, `lastEdited`
 * otherwise, which is the only date this content actually carries.
 */
export const getStaticProps: GetStaticProps<Props> = async () => {
  const manifest = getManifest()

  // Map each top-level slug to its title, so an entry can say where it lives.
  const sectionTitles = new Map(
    Object.entries(manifest.slugTree).map(([slug, node]) => [slug, node.title.trim()])
  )

  const entries: Entry[] = getAllPages()
    .map((page) => {
      // getAllPages hardcodes `published: null` and `lastEdited: ''`, so the
      // dates are read here rather than taken from it. #103 fixes that at the
      // source; this stays independent of whether that has landed.
      const iso = readPageDate(page.id)
      if (!iso) return null
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return null
      return {
        title: page.title.trim(),
        path: '/' + page.path.join('/'),
        section: sectionTitles.get(page.path[0]) || '',
        date: date.toISOString(),
        day: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))

  const byYear = new Map<string, Entry[]>()
  for (const entry of entries) {
    const year = entry.date.slice(0, 4)
    byYear.set(year, [...(byYear.get(year) || []), entry])
  }

  return {
    props: {
      years: [...byYear.entries()].map(([year, list]) => ({ year, entries: list })),
      total: entries.length,
    },
  }
}

export default function ArchivePage({ years, total }: Props) {
  return (
    <>
      <PageHead
        site={config.site}
        title={`Archive — ${config.name}`}
        description={`Everything on ${config.domain}, newest first.`}
      />

      <div className="notion-viewport">
        <NotionPageHeader />

        <div className="notion-page-layout">
          <main className="notion-page">
            <div className="notion-page-content">
              <h1 className="notion-title">Archive</h1>
              <div className="notion-page-meta">
                <span className="notion-page-date">
                  {total} pages, newest first
                </span>
              </div>

              <div className="notion-page-body">
                {years.map(({ year, entries }) => (
                  <section key={year} className="notion-archive-year">
                    <h2 className="notion-h2" id={`year-${year}`}>
                      {year}
                      <span className="notion-archive-count">{entries.length}</span>
                    </h2>
                    <ul className="notion-archive-list">
                      {entries.map((entry) => (
                        <li key={entry.path} className="notion-archive-item">
                          <Link href={entry.path} className="notion-archive-link">
                            <span className="notion-archive-title">{entry.title}</span>
                            {entry.section && (
                              <span className="notion-archive-section">{entry.section}</span>
                            )}
                          </Link>
                          <time className="notion-archive-date" dateTime={entry.date}>
                            {entry.day}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </main>
        </div>

        <Footer />
      </div>
    </>
  )
}
