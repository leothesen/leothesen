import * as React from 'react'

interface TocItem {
  id: string
  text: string
  level: number
}

export function MarkdownTableOfContents({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    for (const heading of headings) {
      const el = document.getElementById(heading.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  const minLevel = Math.min(...headings.map((h) => h.level))

  const dashWidth = (level: number) => {
    switch (level - minLevel) {
      case 0: return 20
      case 1: return 14
      default: return 8
    }
  }

  return (
    <aside className="notion-toc" aria-label="Table of contents">
      <div className="notion-toc-dashes">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className={`notion-toc-dash ${activeId === heading.id ? 'notion-toc-dash-active' : ''}`}
            title={heading.text}
          >
            <span style={{ width: `${dashWidth(heading.level)}px` }} />
          </a>
        ))}
      </div>

      <nav className="notion-toc-expanded">
        <ul>
          {headings.map((heading) => (
            <li
              key={heading.id}
              className={activeId === heading.id ? 'notion-toc-active' : ''}
              style={{ paddingLeft: `${(heading.level - minLevel) * 12}px` }}
            >
              <a href={`#${heading.id}`}>{heading.text}</a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
