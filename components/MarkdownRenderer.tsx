import * as React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'

import type { DatabaseEntry } from '@/lib/types'
import { DatabaseView } from './NotionRenderer'

interface MarkdownRendererProps {
  markdown: string
  databaseEntriesMap?: Record<string, DatabaseEntry[]> | null
}

// react-markdown's Components type doesn't include custom HTML elements,
// so we use a broader type for our components map
type CustomComponents = Components & Record<string, React.ComponentType<any>>

// Generate a stable ID from heading text for TOC linking
function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Extract plain text from React children
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (React.isValidElement(children) && children.props?.children) {
    return extractText(children.props.children)
  }
  return ''
}

export function MarkdownRenderer({ markdown, databaseEntriesMap }: MarkdownRendererProps) {
  // Pre-process: render database entries inline where <database> tags appear
  // We'll handle them as custom components via rehype-raw

  return (
    <div className="notion-page-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={({
          h1: ({ children }) => {
            const id = headingId(extractText(children))
            return <h1 className="notion-h1" id={id}>{children}</h1>
          },
          h2: ({ children }) => {
            const id = headingId(extractText(children))
            return <h2 className="notion-h2" id={id}>{children}</h2>
          },
          h3: ({ children }) => {
            const id = headingId(extractText(children))
            return <h3 className="notion-h3" id={id}>{children}</h3>
          },

          // Paragraphs
          p: ({ children }) => (
            <div className="notion-text"><p>{children}</p></div>
          ),

          // Links
          a: ({ href, children }) => {
            if (!href) return <>{children}</>
            const isInternal = href.startsWith('/')
            if (isInternal) {
              return <Link href={href} className="notion-link">{children}</Link>
            }
            return (
              <a href={href} className="notion-link" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },

          // Images
          img: ({ src, alt }) => (
            <figure className="notion-asset-wrapper">
              <div className="notion-image-wrapper">
                <img src={src} alt={alt || ''} loading="lazy" />
              </div>
              {alt && (
                <figcaption className="notion-asset-caption">{alt}</figcaption>
              )}
            </figure>
          ),

          // Code blocks
          pre: ({ children }) => (
            <div className="notion-code">
              <pre>{children}</pre>
            </div>
          ),

          // Inline code
          code: ({ className, children, ...props }) => {
            // If inside a pre (fenced code block), render with language class
            const isBlock = className?.startsWith('language-')
            if (isBlock) {
              return <code className={className}>{children}</code>
            }
            return <code className="notion-inline-code" {...props}>{children}</code>
          },

          // Lists
          ul: ({ children }) => <ul className="notion-list">{children}</ul>,
          ol: ({ children }) => <ol className="notion-list">{children}</ol>,
          li: ({ children }) => <li className="notion-list-item">{children}</li>,

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="notion-quote">{children}</blockquote>
          ),

          // Table
          table: ({ children }) => (
            <div className="notion-table-wrapper">
              <table className="notion-table">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="notion-table-cell">{children}</th>
          ),
          td: ({ children }) => (
            <td className="notion-table-cell">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="notion-hr" />,

          // Details/summary (toggles)
          details: ({ children }) => (
            <details className="notion-toggle">{children}</details>
          ),
          summary: ({ children }) => <summary>{children}</summary>,

          // Custom Notion elements via rehype-raw
          // Columns layout
          columns: ({ children }) => (
            <div className="notion-row">{children}</div>
          ),
          column: ({ children }) => (
            <div className="notion-column">{children}</div>
          ),

          // Callout blocks - rendered from ::: callout syntax
          // These come through as div elements with specific attributes after rehype-raw
          div: ({ className, children, ...props }) => {
            // Check for callout
            if (className === 'callout') {
              const icon = (props as any)['data-icon']
              const color = (props as any)['data-color']
              return (
                <div className={`notion-callout${color && color !== 'default' ? ` notion-color-${color}` : ''}`}>
                  {icon && (
                    <div className="notion-callout-icon">{icon}</div>
                  )}
                  <div className="notion-callout-text">{children}</div>
                </div>
              )
            }
            return <div className={className} {...props}>{children}</div>
          },

          // Page references
          page: ({ children, ...props }: any) => {
            const url = props.url || ''
            return (
              <div className="notion-page-link">
                <Link href={url} className="notion-link">{children}</Link>
              </div>
            )
          },

          // Database references - render as gallery if we have entries
          database: ({ children, ...props }: any) => {
            const url = props.url || ''
            // Try to find database entries by matching URL
            if (databaseEntriesMap) {
              // Extract database ID from URL
              const idMatch = url.match(/([a-f0-9]{32}|[a-f0-9-]{36})/)
              if (idMatch) {
                const dbId = idMatch[1].replace(/-/g, '')
                const entries = databaseEntriesMap[dbId]
                if (entries?.length) {
                  return <DatabaseView entries={entries} />
                }
              }
            }
            return (
              <div className="notion-page-link">
                <Link href={url}>{children}</Link>
              </div>
            )
          },

          // Mention pages
          'mention-page': ({ children, ...props }: any) => {
            const url = props.url || ''
            return <Link href={url} className="notion-link">{children}</Link>
          },

          // Color spans
          span: ({ children, ...props }: any) => {
            const color = props.color
            if (color) {
              return <span className={`notion-color-${color}`}>{children}</span>
            }
            return <span {...props}>{children}</span>
          },

          // Unknown blocks
          unknown: ({ ...props }: any) => {
            const alt = props.alt || 'unsupported block'
            return (
              <div className="notion-text" style={{ opacity: 0.5, fontStyle: 'italic' }}>
                [{alt}]
              </div>
            )
          },
        }) as CustomComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

// Extract headings from markdown for TableOfContents
export function extractHeadingsFromMarkdown(markdown: string): Array<{ id: string; text: string; level: number }> {
  const headings: Array<{ id: string; text: string; level: number }> = []
  const lines = markdown.split('\n')

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/\*\*|__|[*_`]/g, '') // strip inline formatting
      headings.push({
        id: headingId(text),
        text,
        level,
      })
    }
  }

  return headings
}
