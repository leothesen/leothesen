import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { vi } from 'vitest'

/**
 * A small, hand-shaped `.content` tree for the resolver and its helpers.
 *
 * The real content changes every day with the Notion sync, so exact-value
 * assertions against it would break for reasons unrelated to the code. This
 * mirrors its shape — manifest, slug tree, per-page meta.json and blocks.json,
 * database files — with just enough pages to reach every branch.
 *
 *   /                          ROOT
 *   /ocean                     OCEAN
 *   /ocean/first-swell         FIRST     (also claimed by DUPE — a collision)
 *   /ocean/second-swell        SECOND
 *   /ocean/third-swell         THIRD
 *   /mountains                 MOUNTAINS
 *   /mountains/cederberg       CEDERBERG
 *   /mountains/cederberg/route ROUTE
 *   /mountains/ghost           GHOST     (in the manifest, never synced to disk)
 */

export const IDS = {
  ROOT: '2a9bf7526da84f7daa846a866faf1799',
  OCEAN: 'a0000000000000000000000000000001',
  FIRST: 'a0000000000000000000000000000002',
  SECOND: 'a0000000000000000000000000000003',
  THIRD: 'a0000000000000000000000000000004',
  DUPE: 'a0000000000000000000000000000009',
  MOUNTAINS: 'b0000000000000000000000000000001',
  CEDERBERG: 'b0000000000000000000000000000002',
  ROUTE: 'b0000000000000000000000000000003',
  GHOST: 'b0000000000000000000000000000004',
  UNPUBLISHED: '9f89fcc303e241d080fcb01b8d2472da',
  DATABASE: 'd0000000000000000000000000000001',
} as const

export const uuid = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

const annotations = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
  color: 'default',
}

export function text(content: string, link?: string) {
  return {
    type: 'text',
    text: { content, link: link ? { url: link } : null },
    annotations,
    plain_text: content,
    href: link ?? null,
  }
}

export function paragraph(id: string, ...runs: any[]) {
  return { object: 'block', id, type: 'paragraph', has_children: false, paragraph: { rich_text: runs, color: 'default' } }
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

const node = (pageId: string, title: string, children: Record<string, any> = {}) => ({
  pageId,
  title,
  children,
})

const manifestPage = (slugPath: string[], title: string, extra: Record<string, unknown> = {}) => ({
  slugPath,
  title,
  icon: null,
  cover: null,
  description: null,
  ...extra,
})

export const MANIFEST = {
  syncedAt: '2026-09-01T00:00:00.000Z',
  slugTree: {
    ocean: node(IDS.OCEAN, 'Ocean ', {
      'first-swell': node(IDS.FIRST, 'First swell'),
      'second-swell': node(IDS.SECOND, '  Second swell  '),
      'third-swell': node(IDS.THIRD, 'Third swell'),
    }),
    mountains: node(IDS.MOUNTAINS, 'Mountains', {
      cederberg: node(IDS.CEDERBERG, 'Cederberg', {
        route: node(IDS.ROUTE, 'Route'),
      }),
      ghost: node(IDS.GHOST, 'Ghost'),
    }),
  },
  pages: {
    [IDS.ROOT]: manifestPage([], 'Leo Thesen'),
    [IDS.OCEAN]: manifestPage(['ocean'], 'Ocean', { icon: '🌊' }),
    [IDS.FIRST]: manifestPage(['ocean', 'first-swell'], 'First swell', {
      description: 'The first one',
      cover: 'https://example.public.blob.vercel-storage.com/first.jpg',
    }),
    [IDS.SECOND]: manifestPage(['ocean', 'second-swell'], 'Second swell'),
    [IDS.THIRD]: manifestPage(['ocean', 'third-swell'], 'Third swell'),
    [IDS.DUPE]: manifestPage(['ocean', 'first-swell'], 'First swell (duplicate)'),
    [IDS.MOUNTAINS]: manifestPage(['mountains'], 'Mountains', {
      icon: 'https://example.public.blob.vercel-storage.com/mountain.png',
    }),
    [IDS.CEDERBERG]: manifestPage(['mountains', 'cederberg'], 'Cederberg', { icon: '⛰️' }),
    [IDS.ROUTE]: manifestPage(['mountains', 'cederberg', 'route'], 'Route'),
    [IDS.GHOST]: manifestPage(['mountains', 'ghost'], 'Ghost'),
  },
}

const meta = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id: uuid(id),
  title,
  icon: null,
  cover: null,
  description: null,
  published: null,
  author: null,
  lastEdited: '2025-06-01T10:00:00.000Z',
  created: '2024-01-01T10:00:00.000Z',
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  order: null,
  ...extra,
})

/** Blocks for FIRST: every kind of link the resolver has to rewrite or drop. */
export const FIRST_BLOCKS = [
  paragraph(
    'p1',
    text('Read '),
    // What the Notion app writes for an internal link: relative, no host.
    text('the next one', `/p/${IDS.SECOND}?pvs=25`),
    text(', or '),
    // A page that exists in Notion but is not published.
    text('the archive', `https://www.notion.so/Route-archive-${IDS.UNPUBLISHED}`),
    text(', or '),
    text('somewhere else', 'https://example.com/elsewhere')
  ),
  {
    object: 'block',
    id: 'mention',
    type: 'paragraph',
    has_children: false,
    // A native @page mention carries only `href`, no text.link.
    paragraph: {
      rich_text: [
        {
          type: 'mention',
          mention: { type: 'page', page: { id: uuid(IDS.CEDERBERG) } },
          annotations,
          plain_text: 'Cederberg',
          href: `https://www.notion.so/${IDS.CEDERBERG}`,
        },
      ],
    },
  },
  {
    object: 'block',
    id: 'img',
    type: 'image',
    has_children: false,
    image: {
      type: 'external',
      external: { url: 'https://example.public.blob.vercel-storage.com/wave.jpg' },
      caption: [text('see ', undefined), text('Route', `https://www.notion.so/leothesen/Route-${IDS.ROUTE}`)],
    },
  },
  {
    object: 'block',
    id: 'tgl',
    type: 'toggle',
    has_children: true,
    toggle: { rich_text: [text('More')] },
    children: [paragraph('nested', text('deep link', `/p/${uuid(IDS.THIRD)}`))],
  },
  { object: 'block', id: uuid(IDS.THIRD), type: 'child_page', has_children: false, child_page: { title: 'Third swell' } },
  { object: 'block', id: uuid(IDS.UNPUBLISHED), type: 'child_page', has_children: false, child_page: { title: 'Route archive' } },
  {
    object: 'block',
    id: 'ltp',
    type: 'link_to_page',
    has_children: false,
    link_to_page: { type: 'page_id', page_id: uuid(IDS.ROUTE) },
  },
  { object: 'block', id: uuid(IDS.DATABASE), type: 'child_database', has_children: false, child_database: { title: 'Trips' } },
  paragraph('long', text(words(450))),
]

export const DATABASE_ENTRIES = [
  {
    id: uuid(IDS.SECOND),
    title: 'Second swell',
    description: null,
    cover: null,
    icon: null,
    slug: 'second-swell',
    path: ['ocean', 'second-swell'],
    published: null,
    author: null,
    lastEdited: '2025-06-01T10:00:00.000Z',
    order: 1,
  },
]

/**
 * Writes the fixture to a fresh temp directory and returns its root — the
 * directory whose `.content` the code under test should read.
 */
export function writeContentFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leothesen-content-'))
  const content = path.join(root, '.content')
  const write = (rel: string, data: unknown) => {
    const file = path.join(content, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  }

  write('manifest.json', MANIFEST)

  const pages: Record<string, [unknown, unknown[]]> = {
    [IDS.ROOT]: [meta(IDS.ROOT, 'Leo Thesen', { icon: '👋' }), [paragraph('r1', text('Welcome'))]],
    [IDS.OCEAN]: [meta(IDS.OCEAN, 'Ocean', { icon: '🌊' }), [paragraph('o1', text('Salt water.'))]],
    [IDS.FIRST]: [
      meta(IDS.FIRST, 'First swell', {
        description: 'The first one',
        published: '2023-03-10',
        lastEdited: '2025-01-15T08:00:00.000Z',
        created: '2023-03-01T08:00:00.000Z',
      }),
      FIRST_BLOCKS,
    ],
    [IDS.SECOND]: [meta(IDS.SECOND, 'Second swell', { lastEdited: '2026-02-01T00:00:00.000Z' }), [paragraph('s1', text('Short.'))]],
    [IDS.THIRD]: [meta(IDS.THIRD, 'Third swell'), []],
    [IDS.DUPE]: [meta(IDS.DUPE, 'First swell (duplicate)'), []],
    [IDS.MOUNTAINS]: [meta(IDS.MOUNTAINS, 'Mountains'), []],
    [IDS.CEDERBERG]: [meta(IDS.CEDERBERG, 'Cederberg'), []],
    [IDS.ROUTE]: [meta(IDS.ROUTE, 'Route'), []],
  }

  for (const [id, [pageMeta, blocks]] of Object.entries(pages)) {
    write(`pages/${id}/meta.json`, pageMeta)
    write(`pages/${id}/blocks.json`, blocks)
  }
  write(`pages/${IDS.FIRST}/databases/${IDS.DATABASE}.json`, DATABASE_ENTRIES)

  return root
}

/**
 * Imports a module with `process.cwd()` pointing at a fixture root.
 *
 * lib/notion-local.ts resolves `.content` from the working directory once, at
 * import time, so the module registry is reset first and cwd is only swapped
 * for the duration of the import.
 */
export async function importWithContentRoot<T>(root: string, load: () => Promise<T>): Promise<T> {
  vi.resetModules()
  const spy = vi.spyOn(process, 'cwd').mockReturnValue(root)
  try {
    return await load()
  } finally {
    spy.mockRestore()
  }
}
