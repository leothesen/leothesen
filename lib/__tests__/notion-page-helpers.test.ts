import { beforeEach, describe, expect, it, vi } from 'vitest'

import { findDatabaseBlocks, getChildPageMap, getDatabaseEntries, pageToEntry } from '@/lib/notion'
import {
  getPage,
  getPageCover,
  getPageIcon,
  getPagePropertyText,
  getPageTitle,
  queryDatabase,
} from '@/lib/notion-api'

// notion.ts calls the live API through notion-api; only the network functions
// are replaced, so the pure helpers under test stay real.
vi.mock('@/lib/notion-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notion-api')>()
  return { ...actual, queryDatabase: vi.fn(), getPage: vi.fn() }
})

const rich = (text: string) => [{ plain_text: text }]

function page(overrides: Record<string, any> = {}): any {
  return {
    id: '52ce318b-6309-412f-a221-7af728b7e9f2',
    last_edited_time: '2024-01-02T03:04:05.000Z',
    icon: null,
    cover: null,
    properties: {
      Name: { type: 'title', title: rich('Novel Experiences') },
    },
    ...overrides,
  }
}

describe('getPageTitle', () => {
  it('joins every run of the title property, whatever it is called', () => {
    const p = page({ properties: { Page: { type: 'title', title: [...rich('Ocean '), ...rich('notes')] } } })
    expect(getPageTitle(p)).toBe('Ocean notes')
  })

  it('says Untitled when there is no title property', () => {
    expect(getPageTitle(page({ properties: {} }))).toBe('Untitled')
  })
})

describe('getPagePropertyText', () => {
  const p = page({
    properties: {
      Description: { type: 'rich_text', rich_text: rich('A description') },
      Empty: { type: 'rich_text', rich_text: [] },
      Link: { type: 'url', url: 'https://example.com' },
      Mail: { type: 'email', email: 'leo@example.com' },
      Phone: { type: 'phone_number', phone_number: '+27 21 000 0000' },
      Kind: { type: 'select', select: { name: 'Essay' } },
      NoKind: { type: 'select', select: null },
      Published: { type: 'date', date: { start: '2023-05-01' } },
      Order: { type: 'number', number: 3 },
    },
  })

  it('reads each text-like property type', () => {
    expect(getPagePropertyText(p, 'Description')).toBe('A description')
    expect(getPagePropertyText(p, 'Link')).toBe('https://example.com')
    expect(getPagePropertyText(p, 'Mail')).toBe('leo@example.com')
    expect(getPagePropertyText(p, 'Phone')).toBe('+27 21 000 0000')
    expect(getPagePropertyText(p, 'Kind')).toBe('Essay')
    expect(getPagePropertyText(p, 'Published')).toBe('2023-05-01')
  })

  it('returns null rather than an empty string, so ?? fallbacks work', () => {
    expect(getPagePropertyText(p, 'Empty')).toBeNull()
    expect(getPagePropertyText(p, 'NoKind')).toBeNull()
  })

  it('returns null for missing and non-text properties', () => {
    expect(getPagePropertyText(p, 'Nope')).toBeNull()
    expect(getPagePropertyText(p, 'Order')).toBeNull()
  })
})

describe('getPageCover / getPageIcon', () => {
  it('reads external and file covers', () => {
    expect(getPageCover(page({ cover: { type: 'external', external: { url: 'https://a/x.jpg' } } }))).toBe('https://a/x.jpg')
    expect(getPageCover(page({ cover: { type: 'file', file: { url: 'https://b/y.jpg' } } }))).toBe('https://b/y.jpg')
    expect(getPageCover(page())).toBeNull()
  })

  it('reads emoji, external and file icons', () => {
    expect(getPageIcon(page({ icon: { type: 'emoji', emoji: '🌊' } }))).toBe('🌊')
    expect(getPageIcon(page({ icon: { type: 'external', external: { url: 'https://a/i.png' } } }))).toBe('https://a/i.png')
    expect(getPageIcon(page({ icon: { type: 'file', file: { url: 'https://b/i.png' } } }))).toBe('https://b/i.png')
    expect(getPageIcon(page())).toBeNull()
  })
})

describe('pageToEntry', () => {
  it('builds a database entry with a slug path under its parent', () => {
    const entry = pageToEntry(
      page({
        properties: {
          Name: { type: 'title', title: rich('A Return to Indonesia') },
          Description: { type: 'rich_text', rich_text: rich('Three weeks') },
          Order: { type: 'number', number: 2 },
        },
      }),
      ['novel-experiences']
    )

    expect(entry).toEqual({
      id: '52ce318b-6309-412f-a221-7af728b7e9f2',
      title: 'A Return to Indonesia',
      description: 'Three weeks',
      cover: null,
      icon: null,
      slug: 'a-return-to-indonesia',
      path: ['novel-experiences', 'a-return-to-indonesia'],
      published: null,
      author: null,
      lastEdited: '2024-01-02T03:04:05.000Z',
      order: 2,
    })
  })

  it('falls back to the page id when the title has no sluggable characters', () => {
    const entry = pageToEntry(page({ properties: { Name: { type: 'title', title: rich('🌊') } } }))
    expect(entry.slug).toBe('52ce318b6309412fa2217af728b7e9f2')
  })
})

describe('getDatabaseEntries', () => {
  beforeEach(() => vi.mocked(queryDatabase).mockReset())

  it('sorts by Order when the database has one', async () => {
    vi.mocked(queryDatabase).mockResolvedValueOnce([page()])
    const entries = await getDatabaseEntries('db', ['parent'])

    expect(queryDatabase).toHaveBeenCalledWith('db', [{ property: 'Order', direction: 'ascending' }])
    expect(entries.map((e) => e.path)).toEqual([['parent', 'novel-experiences']])
  })

  it('retries unsorted when the database has no Order property', async () => {
    vi.mocked(queryDatabase)
      .mockRejectedValueOnce({ code: 'validation_error', message: 'Could not find sort property with name or id: Order' })
      .mockResolvedValueOnce([page()])

    const entries = await getDatabaseEntries('db')
    expect(queryDatabase).toHaveBeenLastCalledWith('db')
    expect(entries).toHaveLength(1)
  })

  it('returns an empty list, not a crash, for an inaccessible database', async () => {
    vi.mocked(queryDatabase).mockRejectedValueOnce({ code: 'object_not_found' })
    await expect(getDatabaseEntries('db')).resolves.toEqual([])
  })

  it('returns an empty list when the unsorted retry also fails', async () => {
    vi.mocked(queryDatabase)
      .mockRejectedValueOnce({ code: 'validation_error', message: 'sort property' })
      .mockRejectedValueOnce(new Error('boom'))
    await expect(getDatabaseEntries('db')).resolves.toEqual([])
  })
})

describe('child page helpers', () => {
  it('finds child databases at the top level only', () => {
    const blocks: any[] = [
      { id: '1', type: 'child_database' },
      { id: '2', type: 'paragraph', children: [{ id: '3', type: 'child_database' }] },
    ]
    expect(findDatabaseBlocks(blocks).map((b) => b.id)).toEqual(['1'])
  })

  it('maps child pages nested anywhere, including inside columns', async () => {
    vi.mocked(getPage).mockImplementation(async (id: string) =>
      page({ id, icon: { type: 'emoji', emoji: '⛰️' }, properties: { Name: { type: 'title', title: rich(`Page ${id}`) } } })
    )
    const blocks: any[] = [
      { id: 'a', type: 'child_page' },
      { id: 'cols', type: 'column_list', children: [{ id: 'col', type: 'column', children: [{ id: 'b', type: 'child_page' }] }] },
    ]

    expect(await getChildPageMap(blocks)).toEqual({
      a: { icon: '⛰️', slug: 'page-a', title: 'Page a' },
      b: { icon: '⛰️', slug: 'page-b', title: 'Page b' },
    })
  })

  it('makes no API calls when there are no child pages', async () => {
    vi.mocked(getPage).mockClear()
    expect(await getChildPageMap([{ id: 'p', type: 'paragraph' } as any])).toEqual({})
    expect(getPage).not.toHaveBeenCalled()
  })
})
