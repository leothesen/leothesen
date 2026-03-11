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

// Convert markdown formatting to HTML (for use inside HTML blocks where markdown isn't parsed)
function markdownInlineToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="notion-inline-code">$1</code>')
}

// Convert markdown block + inline syntax to HTML (for content inside HTML blocks like <column>)
// Uses custom element names to avoid HTML5 parser restructuring block elements inside <column>
function markdownBlockToHtml(text: string): string {
  // Strip {color="..."} attributes (handle before other conversions)
  text = text.replace(/\s*\{color="[^"]*"\}/g, '')

  // Convert headings to custom elements (block-level h1-h3 would break <column> parsing)
  text = text.replace(/^\t*(#{3})\s+(.+)$/gm, (_m, _h, content) =>
    `<col-heading level="3">${markdownInlineToHtml(content)}</col-heading>`)
  text = text.replace(/^\t*(#{2})\s+(.+)$/gm, (_m, _h, content) =>
    `<col-heading level="2">${markdownInlineToHtml(content)}</col-heading>`)
  text = text.replace(/^\t*(#{1})\s+(.+)$/gm, (_m, _h, content) =>
    `<col-heading level="1">${markdownInlineToHtml(content)}</col-heading>`)

  // Convert --- to custom element (block-level <hr> would break <column> parsing)
  text = text.replace(/^\t*---\s*$/gm, '<col-hr></col-hr>')

  // Remove <unknown> tags inside columns (embeds/bookmarks can't render locally)
  text = text.replace(/<unknown\s+[^>]*\/>/g, '')

  // Convert images to custom element
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<col-img src="$2" alt="$1"></col-img>')

  // Convert links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="notion-link">$1</a>')

  // Convert inline formatting
  text = markdownInlineToHtml(text)

  return text
}

// Pre-process markdown to convert Notion-specific syntax to HTML
function preprocessMarkdown(md: string): string {
  // Convert ::: callout {icon="X" color="Y"} ... ::: to HTML div
  md = md.replace(
    /^::: callout \{icon="([^"]*)" color="([^"]*)"\}\n([\s\S]*?)^:::\s*$/gm,
    (_match, icon, color, content) => {
      const htmlContent = markdownInlineToHtml(content.trim())
      return `<div class="callout" data-icon="${icon}" data-color="${color}">\n${htmlContent}\n</div>`
    }
  )

  // Remove <empty-block/> tags
  md = md.replace(/<empty-block\s*\/?>/g, '')

  // Strip {color="..."} attributes from text (outside HTML blocks)
  md = md.replace(/\s*\{color="[^"]*"\}/g, '')

  // Convert entire <columns> structure to div-based HTML
  // Browser HTML parser needs block-level elements; custom element names get restructured
  md = md.replace(/<columns>([\s\S]*?)<\/columns>/g, (_match, columnsContent) => {
    const columns = columnsContent.split(/<\/?column>/g)
      .map(c => c.trim())
      .filter(c => c.length > 0)
    const colHtml = columns.map(col =>
      `<div class="notion-column">${markdownBlockToHtml(col)}</div>`
    ).join('\n')
    return `<div class="notion-row">${colHtml}</div>`
  })

  // Normalize <unknown> self-closing tags to open/close pairs for rehype-raw
  // (must happen after column processing which converts them to <unsupported>)
  md = md.replace(/<unknown\s+([^/]*)\/>/g, '<unknown $1></unknown>')

  // Ensure --- has blank lines around it to prevent setext heading interpretation,
  // but only when not inside HTML blocks (already handled above for columns)
  md = md.replace(/(<\/[a-z-]+>)\n---/g, '$1\n\n---')

  return md
}

export function MarkdownRenderer({ markdown, databaseEntriesMap }: MarkdownRendererProps) {
  const processed = preprocessMarkdown(markdown)

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
          // Columns layout (preprocessed to divs, but keep handlers for fallback)
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

          // Custom elements for content inside columns (avoids HTML parser issues)
          'col-heading': ({ children, ...props }: any) => {
            const level = props.level || '2'
            const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
            return <Tag className={`notion-h${level}`}>{children}</Tag>
          },
          'col-hr': () => <hr className="notion-hr" />,
          'col-img': ({ ...props }: any) => (
            <figure className="notion-asset-wrapper">
              <div className="notion-image-wrapper">
                <img src={props.src} alt={props.alt || ''} loading="lazy" />
              </div>
            </figure>
          ),

          // Unknown/unsupported blocks (both <unknown> and <unsupported> custom elements)
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
        {processed}
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
      const text = match[2]
        .replace(/\s*\{color="[^"]*"\}/g, '') // strip color attributes
        .replace(/\*\*|__|[*_`]/g, '') // strip inline formatting
      headings.push({
        id: headingId(text),
        text,
        level,
      })
    }
  }

  return headings
}
