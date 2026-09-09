import * as React from 'react'
import Link from 'next/link'

import * as types from '@/lib/types'

import { PageHead } from './PageHead'
import styles from './styles.module.css'

interface Section {
  title: string
  path: string
}

export const Page404: React.FC<types.PageProps & { sections?: Section[] }> = ({
  site,
  pageId,
  error,
  sections,
}) => {
  const title = site?.name || 'Notion Page Not Found'

  return (
    <>
      <PageHead site={site} title={title} />

      <div className={styles.container}>
        <main className={styles.main}>
          <h1>Page Not Found</h1>

          <p className={styles.notFoundIntro}>
            That page has moved or never existed. Here is the rest of the site.
          </p>

          {/* Rendered from getStaticProps on the 404 route. The client-side
              error path reuses this component without them, so it degrades to
              just the home link. */}
          {sections?.length > 0 && (
            <nav className={styles.notFoundSections} aria-label="Sections">
              {sections.map((section) => (
                <Link key={section.path} href={section.path} className={styles.notFoundSection}>
                  {section.title}
                </Link>
              ))}
            </nav>
          )}

          <div className={styles.notFoundActions}>
            <Link href="/" className={styles.notFoundHome}>
              Go to the home page
            </Link>
            <a
              className={styles.notFoundReport}
              href="https://us14.list-manage.com/contact-form?u=48ac2df5c8c9410ed02b4c867&form_id=b38cf72feb797a9ebd3b251645784085"
              target="_blank"
              rel="noreferrer"
            >
              Let Leo know something is broken
            </a>
          </div>

          {/* The resolver's message names the path that failed, which is worth
              keeping for a mistyped URL — but it is diagnostic, not the point
              of the page, so it sits under everything else. */}
          {error ? (
            <p className={styles.notFoundDetail}>{error.message}</p>
          ) : (
            pageId && (
              <p className={styles.notFoundDetail}>
                Make sure that Notion page &quot;{pageId}&quot; is publicly accessible.
              </p>
            )
          )}

          <img src='/404.png' alt='' className={styles.errorImage} />
        </main>
      </div>
    </>
  )
}
