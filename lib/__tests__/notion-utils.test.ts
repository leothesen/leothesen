import { describe, expect, it } from 'vitest'

import { formatDate, idToUuid, parsePageId, slugify, uuidToId } from '@/lib/notion-utils'

const ID = '2a9bf7526da84f7daa846a866faf1799'
const UUID = '2a9bf752-6da8-4f7d-aa84-6a866faf1799'

describe('parsePageId', () => {
  it('accepts a bare id, dashed or not', () => {
    expect(parsePageId(ID)).toBe(ID)
    expect(parsePageId(UUID)).toBe(ID)
  })

  it('pulls the id off the end of a Notion URL', () => {
    expect(parsePageId(`https://www.notion.so/leothesen/Home-${ID}`)).toBe(ID)
    expect(parsePageId(`https://www.notion.so/${ID}?pvs=4`)).toBe(ID)
  })

  it('returns the uuid form when asked', () => {
    expect(parsePageId(ID, { uuid: true })).toBe(UUID)
  })

  it('returns null for anything that is not an id', () => {
    // The catch-all route hands slugs to this first; a slug must not parse.
    expect(parsePageId('novel-experiences')).toBeNull()
    expect(parsePageId('')).toBeNull()
    expect(parsePageId(null)).toBeNull()
    expect(parsePageId(undefined)).toBeNull()
    expect(parsePageId(ID.slice(1))).toBeNull()
  })
})

describe('idToUuid / uuidToId', () => {
  it('round-trips', () => {
    expect(idToUuid(ID)).toBe(UUID)
    expect(uuidToId(UUID)).toBe(ID)
    expect(idToUuid(uuidToId(UUID))).toBe(UUID)
  })

  it('is idempotent on an already-dashed id', () => {
    expect(idToUuid(UUID)).toBe(UUID)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('On smoking and five-way stop streets')).toBe(
      'on-smoking-and-five-way-stop-streets'
    )
  })

  it('turns an apostrophe into -s-, which is what the live URLs use', () => {
    // A hand-typed link to /mens-fashion-and-the-country 404'd for exactly
    // this reason; the real slug has always been men-s-.
    expect(slugify("Men's fashion and the country")).toBe('men-s-fashion-and-the-country')
  })

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Réunion')).toBe('cafe-reunion')
  })

  it('collapses runs of punctuation and trims the ends', () => {
    expect(slugify('  Leaving Mdumbi... actually, no!  ')).toBe('leaving-mdumbi-actually-no')
    expect(slugify('--a--b--')).toBe('a-b')
  })

  it('can return an empty string, which callers must handle', () => {
    // pageToEntry falls back to the page id in this case.
    expect(slugify('🌊')).toBe('')
  })
})

describe('formatDate', () => {
  it('formats short months by default and long months on request', () => {
    // Midday UTC, so no timezone the tests run in moves it to another day.
    expect(formatDate('2024-03-05T12:00:00.000Z')).toBe('Mar 5, 2024')
    expect(formatDate('2024-03-05T12:00:00.000Z', { month: 'long' })).toBe('March 5, 2024')
  })
})
