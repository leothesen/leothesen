import { describe, expect, it } from 'vitest'

import { describeCollection, describeSpan } from '@/lib/describe-collection'

const stats = (over: Partial<{ pages: number; photos: number; from: string; to: string }> = {}) => ({
  stats: {
    pages: 1,
    photos: 0,
    from: null,
    to: null,
    ...over,
  },
})

describe('describeSpan', () => {
  it('gives a single year when start and end match', () => {
    expect(describeSpan('2022-03-01T00:00:00.000Z', '2022-11-02T00:00:00.000Z')).toBe('2022')
  })

  it('gives an en-dashed range across years', () => {
    expect(describeSpan('2022-03-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z')).toBe('2022–2025')
  })

  it('falls back to the start year when there is no end', () => {
    expect(describeSpan('2024-06-01T00:00:00.000Z', null)).toBe('2024')
  })

  it('says nothing when there is no start', () => {
    expect(describeSpan(null, '2024-06-01T00:00:00.000Z')).toBeNull()
  })

  it('says nothing rather than NaN for an unparseable date', () => {
    expect(describeSpan('not a date', null)).toBeNull()
  })

  it('ignores an unparseable end instead of rendering NaN', () => {
    expect(describeSpan('2024-06-01T00:00:00.000Z', 'rubbish')).toBe('2024')
  })
})

describe('describeCollection', () => {
  it('describes a large collection with all three facts', () => {
    expect(
      describeCollection(
        stats({ pages: 112, photos: 614, from: '2022-06-01T00:00:00.000Z', to: '2023-04-01T00:00:00.000Z' }) as any
      )
    ).toBe('112 entries · 614 photos · 2022–2023')
  })

  it('drops the entry count for a single page, where "1 entry" says nothing', () => {
    expect(
      describeCollection(stats({ pages: 1, photos: 23, from: '2025-07-09T00:00:00.000Z' }) as any)
    ).toBe('23 photos · 2025')
  })

  it('uses the singular for one photograph', () => {
    expect(describeCollection(stats({ pages: 1, photos: 1 }) as any)).toBe('1 photo')
  })

  it('says nothing at all for a page with no photos and no date', () => {
    expect(describeCollection(stats({ pages: 1, photos: 0 }) as any)).toBeNull()
  })

  it('says nothing when stats were never attached', () => {
    expect(describeCollection({ stats: null } as any)).toBeNull()
    expect(describeCollection({} as any)).toBeNull()
  })
})
