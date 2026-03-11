import * as React from 'react'
import type { NotionBlock } from '@/lib/notion-api'

interface TocItem {
  id: string
  text: string
  level: number
}

function collectHeadings(blocks: NotionBlock[]): TocItem[] {
  const headings: TocItem[] = []

  for (const block of blocks) {
    if (block.type === 'heading_1') {
      headings.push({
        id: block.id,
        text: (block as any).heading_1.rich_text.map((t: any) => t.plain_text).join(''),
        level: 1,
      })
    } else if (block.type === 'heading_2') {
      headings.push({
        id: block.id,
        text: (block as any).heading_2.rich_text.map((t: any) => t.plain_text).join(''),
        level: 2,
      })
    } else if (block.type === 'heading_3') {
      headings.push({
        id: block.id,
        text: (block as any).heading_3.rich_text.map((t: any) => t.plain_text).join(''),
        level: 3,
      })
    }

    if (block.children) {
      headings.push(...collectHeadings(block.children))
    }
  }

  return headings
}

export function TableOfContents({ blocks }: { blocks: NotionBlock[] }) {
  const headings = React.useMemo(() => collectHeadings(blocks), [blocks])
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

  // Dash widths: h1 = longest, h3 = shortest
  const dashWidth = (level: number) => {
    switch (level - minLevel) {
      case 0: return 20
      case 1: return 14
      default: return 8
    }
  }

  return (
    <aside className="notion-toc" aria-label="Table of contents">
      {/* Collapsed: vertical dashes */}
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

      {/* Expanded: full text labels */}
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
