import { describe, expect, it } from 'vitest'

import { notionPageIdFromUrl } from '@/lib/notion-link'

const ID = '330ca8d550aa4141983499f780a55cb6'
const DASHED = '330ca8d5-50aa-4141-9834-99f780a55cb6'

describe('notionPageIdFromUrl', () => {
  it('reads the relative form the Notion app actually writes', () => {
    // The regression. Converting a link inside Notion produces this, and it
    // used to go unrewritten — leaving a same-site href to /p/<id>, which 404s.
    expect(notionPageIdFromUrl(`/p/${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`/p/${ID}?pvs=25`)).toBe(ID)
    expect(notionPageIdFromUrl(`/p/${DASHED}?pvs=25`)).toBe(ID)
  })

  it('still reads every absolute form', () => {
    expect(notionPageIdFromUrl(`https://www.notion.so/${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`https://notion.so/${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`https://www.notion.so/Recce-run-${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`https://www.notion.so/leothesen/Some-Page-${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`https://app.notion.com/p/${ID}?pvs=204`)).toBe(ID)
    expect(notionPageIdFromUrl(`https://www.notion.so/${DASHED}`)).toBe(ID)
  })

  it('normalises to the undashed lowercase form the manifest is keyed by', () => {
    expect(notionPageIdFromUrl(`https://www.notion.so/${DASHED.toUpperCase()}`)).toBe(ID)
  })

  it('reads a bare relative id', () => {
    expect(notionPageIdFromUrl(`/${ID}`)).toBe(ID)
    expect(notionPageIdFromUrl(`/${ID}#heading`)).toBe(ID)
  })

  it('returns null for links that are not Notion pages', () => {
    // These must keep their href untouched — rewriting them would break real
    // outbound links.
    expect(notionPageIdFromUrl('https://leothesen.com/recce-run')).toBeNull()
    expect(notionPageIdFromUrl('https://mdumbi.co.za/')).toBeNull()
    expect(notionPageIdFromUrl('/novel-experiences/sabbatical')).toBeNull()
    expect(notionPageIdFromUrl('mailto:leo@example.com')).toBeNull()
    expect(notionPageIdFromUrl('')).toBeNull()
    expect(notionPageIdFromUrl(undefined)).toBeNull()
    expect(notionPageIdFromUrl(null)).toBeNull()
  })

  it('does not mistake a lookalike for an id', () => {
    // 31 and 33 hex characters, and a non-hex run of the right length.
    expect(notionPageIdFromUrl('/p/330ca8d550aa4141983499f780a55cb')).toBeNull()
    expect(notionPageIdFromUrl('/p/zzzca8d550aa4141983499f780a55cb6')).toBeNull()
  })

  it('handles the six links from the Mdumbi page', () => {
    // The exact hrefs the API returned after Leo converted them by hand.
    const real = [
      '/p/330ca8d550aa4141983499f780a55cb6',
      '/p/1eae866717924de99563b881cab66de8',
      '/p/dd7fb5aa6ad0483f8a8a71c5a7db68d3',
      '/p/028c738e2dbb4ceb8650a1572d12ca11',
      '/p/3e335a6325cd4c28af1ddce6bf4989ae',
      '/p/438b6ca37dec424691590d089349d255',
    ]
    for (const href of real) {
      expect(notionPageIdFromUrl(href)).toBe(href.slice(3))
    }
  })
})
