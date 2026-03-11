import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'

import type { NotionBlock } from '@/lib/notion-api'
import type { ChildPageInfo } from '@/lib/notion'
import type { DatabaseEntry } from '@/lib/types'

// Rich text rendering
interface RichTextItem {
  type: string
  text?: { content: string; link?: { url: string } | null }
  mention?: any
  equation?: { expression: string }
  annotations: {
    bold: boolean
    italic: boolean
    strikethrough: boolean
    underline: boolean
    code: boolean
    color: string
  }
  plain_text: string
  href?: string | null
}

export function RichText({ richText }: { richText: RichTextItem[] }) {
  if (!richText) return null

  return (
    <>
      {richText.map((item, i) => {
        let content: React.ReactNode = item.plain_text.includes('\n')
          ? item.plain_text.split('\n').map((line, j, arr) => (
              <React.Fragment key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </React.Fragment>
            ))
          : item.plain_text

        if (item.href) {
          const isInternal = item.href.startsWith('/')
          content = isInternal ? (
            <Link href={item.href} className="notion-link">{content}</Link>
          ) : (
            <a href={item.href} className="notion-link" target="_blank" rel="noopener noreferrer">{content}</a>
          )
        }

        const { bold, italic, strikethrough, underline, code, color } = item.annotations

        if (code) content = <code className="notion-inline-code">{content}</code>
        if (bold) content = <strong>{content}</strong>
        if (italic) content = <em>{content}</em>
        if (strikethrough) content = <s>{content}</s>
        if (underline) content = <u>{content}</u>

        if (color && color !== 'default') {
          content = <span className={`notion-color-${color}`}>{content}</span>
        }

        return <React.Fragment key={i}>{content}</React.Fragment>
      })}
    </>
  )
}

// Individual block renderer
export function NotionBlock({ block, mapPageUrl, databaseEntriesMap, childPageMap }: { block: NotionBlock; mapPageUrl?: (id: string) => string; databaseEntriesMap?: Record<string, DatabaseEntry[]> | null; childPageMap?: Record<string, ChildPageInfo> | null }) {
  const renderChildren = () => {
    if (!block.children?.length) return null
    return (
      <div className="notion-block-children">
        <NotionBlocks blocks={block.children} mapPageUrl={mapPageUrl} databaseEntriesMap={databaseEntriesMap} childPageMap={childPageMap} />
      </div>
    )
  }

  switch (block.type) {
    case 'paragraph':
      return (
        <div className="notion-text">
          <p><RichText richText={(block as any).paragraph.rich_text} /></p>
          {renderChildren()}
        </div>
      )

    case 'heading_1':
      return (
        <h1 className="notion-h1" id={block.id}>
          <RichText richText={(block as any).heading_1.rich_text} />
        </h1>
      )

    case 'heading_2':
      return (
        <h2 className="notion-h2" id={block.id}>
          <RichText richText={(block as any).heading_2.rich_text} />
        </h2>
      )

    case 'heading_3':
      return (
        <h3 className="notion-h3" id={block.id}>
          <RichText richText={(block as any).heading_3.rich_text} />
        </h3>
      )

    case 'bulleted_list_item':
      return (
        <li className="notion-list-item">
          <RichText richText={(block as any).bulleted_list_item.rich_text} />
          {renderChildren()}
        </li>
      )

    case 'numbered_list_item':
      return (
        <li className="notion-list-item">
          <RichText richText={(block as any).numbered_list_item.rich_text} />
          {renderChildren()}
        </li>
      )

    case 'to_do': {
      const todo = (block as any).to_do
      return (
        <div className="notion-to-do">
          <label>
            <input type="checkbox" checked={todo.checked} readOnly />
            <span className={todo.checked ? 'notion-to-do-checked' : ''}>
              <RichText richText={todo.rich_text} />
            </span>
          </label>
          {renderChildren()}
        </div>
      )
    }

    case 'toggle': {
      const toggle = (block as any).toggle
      return (
        <details className="notion-toggle">
          <summary>
            <RichText richText={toggle.rich_text} />
          </summary>
          {renderChildren()}
        </details>
      )
    }

    case 'code': {
      const code = (block as any).code
      return (
        <div className="notion-code">
          <pre>
            <code className={`language-${code.language}`}>
              {code.rich_text.map((t: any) => t.plain_text).join('')}
            </code>
          </pre>
          {code.caption?.length > 0 && (
            <figcaption className="notion-asset-caption">
              <RichText richText={code.caption} />
            </figcaption>
          )}
        </div>
      )
    }

    case 'image': {
      const image = (block as any).image
      const src = image.type === 'external' ? image.external.url : image.file.url
      const caption = image.caption || []
      return (
        <figure className="notion-asset-wrapper">
          <div className="notion-image-wrapper">
            <img src={src} alt={caption.map((c: any) => c.plain_text).join('') || ''} loading="lazy" />
          </div>
          {caption.length > 0 && (
            <figcaption className="notion-asset-caption">
              <RichText richText={caption} />
            </figcaption>
          )}
        </figure>
      )
    }

    case 'video': {
      const video = (block as any).video
      const src = video.type === 'external' ? video.external.url : video.file?.url
      if (!src) return null

      // YouTube/Vimeo embeds
      const youtubeMatch = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
      const vimeoMatch = src.match(/vimeo\.com\/(\d+)/)

      if (youtubeMatch) {
        return (
          <figure className="notion-asset-wrapper notion-asset-wrapper-video">
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                allowFullScreen
                loading="lazy"
              />
            </div>
          </figure>
        )
      }

      if (vimeoMatch) {
        return (
          <figure className="notion-asset-wrapper notion-asset-wrapper-video">
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                allowFullScreen
                loading="lazy"
              />
            </div>
          </figure>
        )
      }

      return (
        <figure className="notion-asset-wrapper notion-asset-wrapper-video">
          <video src={src} controls style={{ width: '100%' }} />
        </figure>
      )
    }

    case 'embed':
    case 'link_preview': {
      const data = (block as any)[block.type]
      const url = data.url
      return (
        <figure className="notion-asset-wrapper">
          <iframe
            src={url}
            style={{ width: '100%', minHeight: '400px', border: 'none' }}
            loading="lazy"
            allowFullScreen
          />
        </figure>
      )
    }

    case 'bookmark': {
      const bookmark = (block as any).bookmark
      const caption = bookmark.caption || []
      return (
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="notion-bookmark"
        >
          <div className="notion-bookmark-content">
            <div className="notion-bookmark-title">
              {caption.length > 0
                ? caption.map((c: any) => c.plain_text).join('')
                : bookmark.url}
            </div>
            <div className="notion-bookmark-link">
              <span className="notion-bookmark-link-text">{bookmark.url}</span>
            </div>
          </div>
        </a>
      )
    }

    case 'quote':
      return (
        <blockquote className="notion-quote">
          <RichText richText={(block as any).quote.rich_text} />
          {renderChildren()}
        </blockquote>
      )

    case 'callout': {
      const callout = (block as any).callout
      const icon = callout.icon
      return (
        <div className={`notion-callout${callout.color && callout.color !== 'default' ? ` notion-color-${callout.color}` : ''}`}>
          {icon && (
            <div className="notion-callout-icon">
              {icon.type === 'emoji' ? icon.emoji : null}
            </div>
          )}
          <div className="notion-callout-text">
            <RichText richText={callout.rich_text} />
            {renderChildren()}
          </div>
        </div>
      )
    }

    case 'divider':
      return <hr className="notion-hr" />

    case 'table': {
      return (
        <div className="notion-table-wrapper">
          <table className="notion-table">
            <tbody>
              {block.children?.map((row, rowIndex) => {
                const cells = (row as any).table_row?.cells || []
                const isHeader = (block as any).table.has_column_header && rowIndex === 0
                return (
                  <tr key={row.id}>
                    {cells.map((cell: any, cellIndex: number) => {
                      const CellTag = isHeader ? 'th' : 'td'
                      return (
                        <CellTag key={cellIndex} className="notion-table-cell">
                          <RichText richText={cell} />
                        </CellTag>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }

    case 'column_list':
      return (
        <div className="notion-row">
          {block.children?.map((column) => (
            <div key={column.id} className="notion-column">
              {column.children && (
                <NotionBlocks blocks={column.children} mapPageUrl={mapPageUrl} databaseEntriesMap={databaseEntriesMap} childPageMap={childPageMap} />
              )}
            </div>
          ))}
        </div>
      )

    case 'column':
      // Handled by column_list
      return null

    case 'child_page': {
      const childPage = (block as any).child_page
      const info = childPageMap?.[block.id]
      const href = info ? `/${info.slug}` : (mapPageUrl ? mapPageUrl(block.id) : `/${block.id}`)
      return (
        <div className="notion-page-link">
          <Link href={href}>
            {info?.icon && (
              <span className="notion-page-link-icon">
                {info.icon.startsWith('http') ? (
                  <img src={info.icon} alt="" className="notion-page-icon-inline" />
                ) : info.icon}
              </span>
            )}
            {childPage.title}
          </Link>
        </div>
      )
    }

    case 'child_database': {
      const entries = databaseEntriesMap?.[block.id]
      if (!entries?.length) return null
      return <DatabaseView entries={entries} />
    }

    case 'table_of_contents':
      // Could implement TOC generation from headings
      return null

    case 'synced_block':
      return renderChildren()

    case 'file': {
      const file = (block as any).file
      const src = file.type === 'external' ? file.external.url : file.file?.url
      const caption = file.caption || []
      const name = caption.length > 0
        ? caption.map((c: any) => c.plain_text).join('')
        : 'Download file'
      return (
        <div className="notion-file">
          <a href={src} target="_blank" rel="noopener noreferrer">
            {name}
          </a>
        </div>
      )
    }

    default:
      // Silently skip unsupported block types
      return null
  }
}

// Helper to group list items
function groupBlocks(blocks: NotionBlock[]): Array<NotionBlock | { type: 'list_group'; listType: string; items: NotionBlock[] }> {
  const grouped: Array<any> = []
  let currentList: { type: 'list_group'; listType: string; items: NotionBlock[] } | null = null

  for (const block of blocks) {
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      if (currentList && currentList.listType === block.type) {
        currentList.items.push(block)
      } else {
        if (currentList) grouped.push(currentList)
        currentList = { type: 'list_group', listType: block.type, items: [block] }
      }
    } else {
      if (currentList) {
        grouped.push(currentList)
        currentList = null
      }
      grouped.push(block)
    }
  }

  if (currentList) grouped.push(currentList)
  return grouped
}

// Blocks renderer (handles list grouping)
export function NotionBlocks({ blocks, mapPageUrl, databaseEntriesMap, childPageMap }: { blocks: NotionBlock[]; mapPageUrl?: (id: string) => string; databaseEntriesMap?: Record<string, DatabaseEntry[]> | null; childPageMap?: Record<string, ChildPageInfo> | null }) {
  const grouped = groupBlocks(blocks)

  return (
    <>
      {grouped.map((item, i) => {
        if (item.type === 'list_group') {
          const ListTag = item.listType === 'numbered_list_item' ? 'ol' : 'ul'
          return (
            <ListTag key={i} className="notion-list">
              {item.items.map((block: NotionBlock) => (
                <NotionBlock key={block.id} block={block} mapPageUrl={mapPageUrl} databaseEntriesMap={databaseEntriesMap} childPageMap={childPageMap} />
              ))}
            </ListTag>
          )
        }

        return <NotionBlock key={item.id} block={item} mapPageUrl={mapPageUrl} databaseEntriesMap={databaseEntriesMap} childPageMap={childPageMap} />
      })}
    </>
  )
}

// Database gallery view
export function DatabaseView({ entries }: { entries: DatabaseEntry[] }) {
  if (!entries?.length) return null

  return (
    <div className="notion-gallery-grid">
      {entries.map((entry) => {
        const href = `/${entry.path.join('/')}`
        return (
          <Link key={entry.id} href={href} className="notion-collection-card">
            {entry.cover && (
              <div className="notion-collection-card-cover">
                <img src={entry.cover} alt={entry.title} loading="lazy" />
              </div>
            )}
            <div className="notion-collection-card-body">
              <div className="notion-page-title-text">{entry.title}</div>
              {entry.description && (
                <div className="notion-collection-card-property">
                  <span className="notion-property-text">{entry.description}</span>
                </div>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
