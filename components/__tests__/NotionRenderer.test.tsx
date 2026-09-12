// @vitest-environment jsdom
import * as React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  computeHeadingOffset,
  DatabaseView,
  HeadingOffsetProvider,
  NotionBlocks,
  RichText,
} from '@/components/NotionRenderer'

/**
 * The renderer is hand-rolled rather than react-notion-x, so every block type
 * the site shows is a case written here — and every one Notion adds is a case
 * that silently renders nothing until someone writes it.
 */

const plain = { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }

function run(content: string, opts: { href?: string | null; annotations?: Partial<typeof plain> } = {}) {
  return {
    type: 'text',
    text: { content, link: opts.href ? { url: opts.href } : null },
    annotations: { ...plain, ...opts.annotations },
    plain_text: content,
    href: opts.href ?? null,
  }
}

let n = 0
function block(type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): any {
  n += 1
  return { object: 'block', id: `block-${n}`, type, has_children: false, [type]: data, ...extra }
}

const para = (...runs: any[]) => block('paragraph', { rich_text: runs })

function renderBlocks(blocks: any[], props: Record<string, unknown> = {}) {
  return render(
    <HeadingOffsetProvider blocks={blocks}>
      <NotionBlocks blocks={blocks} {...props} />
    </HeadingOffsetProvider>
  ).container
}

describe('RichText', () => {
  it('renders an internal link as a same-tab link', () => {
    const { container } = render(<RichText richText={[run('Ocean', { href: '/ocean' })]} />)
    const a = container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('/ocean')
    expect(a.getAttribute('target')).toBeNull()
  })

  it('opens an external link in a new tab without leaking the opener', () => {
    const { container } = render(<RichText richText={[run('GitHub', { href: 'https://github.com/leothesen' })]} />)
    const a = container.querySelector('a')!
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('treats an absolute leothesen.com URL as external', () => {
    // Why hardcoded self-links opened new tabs; kept explicit so a change to
    // this rule is a deliberate one.
    const { container } = render(<RichText richText={[run('me', { href: 'https://leothesen.com/ocean' })]} />)
    expect(container.querySelector('a')!.getAttribute('target')).toBe('_blank')
  })

  it('applies every annotation, and colour as a class', () => {
    const { container } = render(
      <RichText
        richText={[
          run('x', { annotations: { bold: true, italic: true, strikethrough: true, underline: true, code: true, color: 'red' } }),
        ]}
      />
    )
    expect(container.innerHTML).toBe(
      '<span class="notion-color-red"><u><s><em><strong><code class="notion-inline-code">x</code></strong></em></s></u></span>'
    )
  })

  it('keeps line breaks inside a run', () => {
    const { container } = render(<RichText richText={[run('one\ntwo\nthree')]} />)
    expect(container.querySelectorAll('br')).toHaveLength(2)
    expect(container.textContent).toBe('onetwothree')
  })

  it('renders nothing for missing rich text', () => {
    const { container } = render(<RichText richText={undefined as any} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('headings', () => {
  const h = (level: 1 | 2 | 3, textContent: string) => block(`heading_${level}`, { rich_text: [run(textContent)] })

  it('computes the offset from the shallowest heading used', () => {
    expect(computeHeadingOffset([h(1, 'a'), h(2, 'b')] as any)).toBe(1)
    expect(computeHeadingOffset([h(2, 'a'), h(3, 'b')] as any)).toBe(0)
    expect(computeHeadingOffset([h(3, 'a')] as any)).toBe(-1)
    expect(computeHeadingOffset([para(run('none'))] as any)).toBe(1)
  })

  it('finds headings nested in children', () => {
    const toggle = block('toggle', { rich_text: [] }, { children: [h(2, 'inside')] })
    expect(computeHeadingOffset([toggle] as any)).toBe(0)
  })

  it('never emits an <h1>, which belongs to the page title', () => {
    const container = renderBlocks([h(1, 'One'), h(2, 'Two'), h(3, 'Three')])
    expect(container.querySelector('h1')).toBeNull()
    expect([...container.querySelectorAll('h2,h3,h4')].map((el) => el.tagName)).toEqual(['H2', 'H3', 'H4'])
  })

  it('makes a page that starts at heading_2 begin at <h2>, not skip to <h3>', () => {
    const container = renderBlocks([h(2, 'Two'), h(3, 'Three')])
    expect([...container.querySelectorAll('h2,h3')].map((el) => el.tagName)).toEqual(['H2', 'H3'])
  })

  it('keeps the Notion level as the class and the block id as the anchor', () => {
    // The table of contents links to #<block id>.
    const heading = h(1, 'Anchor me')
    const container = renderBlocks([heading])
    const el = container.querySelector('h2')!
    expect(el.className).toBe('notion-h1')
    expect(el.id).toBe(heading.id)
  })
})

describe('lists', () => {
  const bullet = (t: string) => block('bulleted_list_item', { rich_text: [run(t)] })
  const numbered = (t: string) => block('numbered_list_item', { rich_text: [run(t)] })

  it('groups consecutive items into one list', () => {
    const container = renderBlocks([bullet('a'), bullet('b'), bullet('c')])
    expect(container.querySelectorAll('ul')).toHaveLength(1)
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
  })

  it('starts a new list when the type changes or a paragraph intervenes', () => {
    const container = renderBlocks([bullet('a'), numbered('1'), numbered('2'), para(run('break')), numbered('3')])
    expect([...container.children].map((el) => el.tagName)).toEqual(['UL', 'OL', 'DIV', 'OL'])
    expect(container.querySelectorAll('ol')[0].children).toHaveLength(2)
  })

  it('renders nested children inside the item', () => {
    const parent = block('bulleted_list_item', { rich_text: [run('parent')] }, { children: [bullet('child')] })
    const container = renderBlocks([parent])
    expect(container.querySelector('ul li ul li')!.textContent).toBe('child')
  })
})

describe('simple blocks', () => {
  it('renders to-dos, toggles, quotes, dividers and code', () => {
    const container = renderBlocks([
      block('to_do', { rich_text: [run('done')], checked: true }),
      block('toggle', { rich_text: [run('Open me')] }, { children: [para(run('hidden'))] }),
      block('quote', { rich_text: [run('Said once')] }),
      block('divider', {}),
      block('code', { language: 'typescript', rich_text: [run('const a'), run(' = 1')], caption: [run('snippet')] }),
    ])

    const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    expect(checkbox.checked).toBe(true)
    expect(container.querySelector('.notion-to-do-checked')!.textContent).toBe('done')
    expect(container.querySelector('details summary')!.textContent).toBe('Open me')
    expect(container.querySelector('details .notion-block-children')!.textContent).toBe('hidden')
    expect(container.querySelector('blockquote')!.textContent).toBe('Said once')
    expect(container.querySelector('hr.notion-hr')).not.toBeNull()
    const code = container.querySelector('pre code')!
    expect(code.className).toBe('language-typescript')
    expect(code.textContent).toBe('const a = 1')
    expect(container.querySelector('.notion-code figcaption')!.textContent).toBe('snippet')
  })

  it('shows an emoji callout icon and a colour class, but no file icon', () => {
    const container = renderBlocks([
      block('callout', { rich_text: [run('Note')], icon: { type: 'emoji', emoji: '💡' }, color: 'blue_background' }),
      block('callout', { rich_text: [run('Logo')], icon: { type: 'file', file: { url: 'https://x/logo.png' } }, color: 'default' }),
    ])
    const [first, second] = container.querySelectorAll('.notion-callout')
    expect(first.className).toBe('notion-callout notion-color-blue_background')
    expect(first.querySelector('.notion-callout-icon')!.textContent).toBe('💡')
    expect(second.className).toBe('notion-callout')
    expect(second.querySelector('.notion-callout-icon')!.textContent).toBe('')
  })

  it('renders synced blocks as their children', () => {
    const container = renderBlocks([block('synced_block', {}, { children: [para(run('shared text'))] })])
    expect(container.textContent).toBe('shared text')
  })
})

describe('tables and columns', () => {
  const row = (...cells: string[]) => block('table_row', { cells: cells.map((c) => [run(c)]) })

  it('uses <th> for the first row only when the table has a column header', () => {
    const table = block('table', { has_column_header: true }, { children: [row('Name', 'Km'), row('Cederberg', '52')] })
    const container = renderBlocks([table])
    expect([...container.querySelectorAll('th')].map((c) => c.textContent)).toEqual(['Name', 'Km'])
    expect([...container.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['Cederberg', '52'])
  })

  it('uses <td> throughout when there is no header', () => {
    const table = block('table', { has_column_header: false }, { children: [row('a', 'b')] })
    expect(renderBlocks([table]).querySelector('th')).toBeNull()
  })

  it('lays columns out side by side with their content', () => {
    const columns = block('column_list', {}, {
      children: [
        block('column', {}, { children: [para(run('left'))] }),
        block('column', {}, { children: [para(run('right'))] }),
      ],
    })
    const container = renderBlocks([columns])
    expect([...container.querySelectorAll('.notion-row > .notion-column')].map((c) => c.textContent)).toEqual([
      'left',
      'right',
    ])
  })
})

describe('images', () => {
  it('uses the caption as alt text and resizes through next/image', () => {
    const container = renderBlocks([
      block('image', {
        type: 'external',
        external: { url: 'https://x.public.blob.vercel-storage.com/wave.jpg' },
        caption: [run('A wave')],
      }),
    ])
    const img = container.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('A wave')
    expect(img.getAttribute('src')).toContain('/_next/image?url=')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(container.querySelector('figcaption')!.textContent).toBe('A wave')
  })

  it('starts blurred and un-blurs when the image loads', async () => {
    const container = renderBlocks([
      block('image', { type: 'file', file: { url: 'https://x.public.blob.vercel-storage.com/a.jpg' }, caption: [] }),
    ])
    const img = container.querySelector('img')!
    expect(img.classList.contains('notion-image-loading')).toBe(true)
    fireEvent.load(img)
    // next/image calls onLoad after img.decode() settles, a microtask later.
    await waitFor(() => expect(img.classList.contains('notion-image-loading')).toBe(false))
    expect(container.querySelector('figcaption')).toBeNull()
  })
})

describe('video', () => {
  const video = (url: string, caption: any[] = []) => block('video', { type: 'external', external: { url }, caption })

  it.each([
    ['watch', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'],
    ['short link', 'https://youtu.be/dQw4w9WgXcQ?si=trackingjunk'],
    ['embed', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['live', 'https://www.youtube.com/live/dQw4w9WgXcQ'],
  ])('turns a YouTube %s link into the lazy player with a clean id', (_, url) => {
    const container = renderBlocks([video(url)])
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(container.querySelector('.notion-youtube-portrait')).toBeNull()
  })

  it('gives Shorts the portrait frame instead of the <video> fallback', () => {
    const container = renderBlocks([video('https://www.youtube.com/shorts/abcdefghijk', [run('Barrel')])])
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('.notion-youtube-portrait')).not.toBeNull()
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Play video: Barrel')
  })

  it('frames Vimeo with its own player', () => {
    const container = renderBlocks([video('https://vimeo.com/123456789')])
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
  })

  it('plays an uploaded file in a <video>', () => {
    const container = renderBlocks([block('video', { type: 'file', file: { url: 'https://x/clip.mp4' } })])
    expect(container.querySelector('video')!.getAttribute('src')).toBe('https://x/clip.mp4')
  })

  it('renders nothing for a video with no URL', () => {
    expect(renderBlocks([block('video', { type: 'file', file: null })]).innerHTML).toBe('')
  })
})

describe('embeds', () => {
  it('renders nothing for an empty embed, rather than framing the page itself', () => {
    const container = renderBlocks([block('embed', { url: '' })])
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('frames a recognised player at its own height', () => {
    const container = renderBlocks([block('embed', { url: 'https://open.spotify.com/track/abc' })])
    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('src')).toBe('https://open.spotify.com/embed/track/abc')
    expect(iframe.getAttribute('title')).toBe('Spotify player')
    expect(iframe.style.height).toBe('152px')
  })

  it('shows a bookmark card for a page that refuses to be framed', () => {
    const container = renderBlocks([block('embed', { url: 'https://maggieappleton.com/garden' })])
    expect(container.querySelector('iframe')).toBeNull()
    const card = container.querySelector('a.notion-bookmark')!
    expect(card.getAttribute('href')).toBe('https://maggieappleton.com/garden')
    expect(card.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('hands cal.com to the self-sizing booker', () => {
    const container = renderBlocks([block('embed', { url: 'https://cal.com/leo-thesen/15min' })])
    expect(container.querySelector('.notion-cal-embed iframe')!.getAttribute('title')).toBe('Book a meeting')
  })

  it('does not mistake a lookalike host for cal.com', () => {
    const container = renderBlocks([block('embed', { url: 'https://notcal.com/leo' })])
    expect(container.querySelector('.notion-cal-embed')).toBeNull()
    expect(container.querySelector('iframe')!.getAttribute('title')).toBe('Embedded content')
  })

  it('treats link_preview blocks the same way', () => {
    const container = renderBlocks([block('link_preview', { url: 'https://soundcloud.com/a/b' })])
    expect(container.querySelector('iframe')!.getAttribute('src')).toContain('https://w.soundcloud.com/player/')
  })
})

describe('bookmarks and files', () => {
  it('labels a bookmark with its caption, or its URL without one', () => {
    const container = renderBlocks([
      block('bookmark', { url: 'https://example.com/a', caption: [run('Example')] }),
      block('bookmark', { url: 'https://example.com/b', caption: [] }),
    ])
    expect([...container.querySelectorAll('.notion-bookmark-title')].map((t) => t.textContent)).toEqual([
      'Example',
      'https://example.com/b',
    ])
  })

  it('links a file by its caption, or as "Download file"', () => {
    const container = renderBlocks([
      block('file', { type: 'external', external: { url: 'https://x/cv.pdf' }, caption: [run('My CV')] }),
      block('file', { type: 'file', file: { url: 'https://x/doc.pdf' }, caption: [] }),
    ])
    const links = [...container.querySelectorAll('.notion-file a')]
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['My CV', 'https://x/cv.pdf'],
      ['Download file', 'https://x/doc.pdf'],
    ])
  })
})

describe('links to other pages', () => {
  const childPageMap = {
    'child-1': { icon: '🌊', slug: 'ocean/first-swell', title: 'First swell' },
    'target-1': { icon: 'https://x/icon.png', slug: 'mountains/route', title: 'Route' },
  }

  it('links a child page by its slug, with its icon', () => {
    const container = renderBlocks([{ ...block('child_page', { title: 'First swell' }), id: 'child-1' }], { childPageMap })
    const a = container.querySelector('.notion-page-link a')!
    expect(a.getAttribute('href')).toBe('/ocean/first-swell')
    expect(a.textContent).toBe('🌊First swell')
  })

  it('shows an unsynced child page as plain text, never as a dead link', () => {
    // /mountains/cederberg-fastpack-2024 once shipped <a href="/<uuid>">.
    const container = renderBlocks([{ ...block('child_page', { title: 'Route archive' }), id: 'missing' }], { childPageMap })
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('.notion-page-link-unresolved')!.textContent).toBe('Route archive')
  })

  it('links link_to_page by either id form, with an image icon', () => {
    const container = renderBlocks([block('link_to_page', { type: 'page_id', page_id: 'target-1' })], { childPageMap })
    const a = container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('/mountains/route')
    expect(a.querySelector('img')!.getAttribute('src')).toBe('https://x/icon.png')
  })

  it('renders nothing for an unresolvable link_to_page, which has no title of its own', () => {
    const container = renderBlocks([block('link_to_page', { type: 'page_id', page_id: 'gone' })], { childPageMap })
    expect(container.innerHTML).toBe('')
  })
})

describe('databases', () => {
  const entries: any[] = [
    { id: 'e1', title: 'Padang', description: 'West Sumatra', cover: 'https://x.public.blob.vercel-storage.com/p.jpg', path: ['novel-experiences', 'padang'] },
    { id: 'e2', title: 'Kassie', description: null, cover: null, path: ['people', 'kassie'] },
  ]

  it('renders a child database as a gallery of linked cards', () => {
    const db = { ...block('child_database', { title: 'Trips' }), id: 'db-uuid' }
    const container = renderBlocks([db], { databaseEntriesMap: { 'db-uuid': entries } })
    const cards = [...container.querySelectorAll('a.notion-collection-card')]
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/novel-experiences/padang', '/people/kassie'])
    expect(cards[0].querySelector('img')!.getAttribute('alt')).toBe('Padang')
    expect(cards[0].textContent).toContain('West Sumatra')
    expect(cards[1].querySelector('.notion-collection-card-cover-placeholder')).not.toBeNull()
  })

  it('renders nothing for a database with no entries', () => {
    const db = { ...block('child_database', { title: 'Empty' }), id: 'db-uuid' }
    expect(renderBlocks([db], { databaseEntriesMap: {} }).innerHTML).toBe('')
    expect(render(<DatabaseView entries={[]} />).container.innerHTML).toBe('')
  })
})

describe('block types the renderer does not draw', () => {
  it.each(['table_of_contents', 'column', 'equation', 'audio', 'heading_4', 'unsupported', 'breadcrumb'])(
    'skips %s without throwing',
    (type) => {
      expect(renderBlocks([block(type, {})]).innerHTML).toBe('')
    }
  )
})
