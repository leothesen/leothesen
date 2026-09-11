import { describe, expect, it } from 'vitest'

import { groupBlocks, isSpacerParagraph } from '@/lib/group-blocks'
import type { NotionBlock } from '@/lib/notion-api'

let nextId = 0
const image = (): NotionBlock =>
  ({ id: `img-${nextId++}`, type: 'image', image: { type: 'file', file: { url: 'x' } } }) as any
const video = (): NotionBlock =>
  ({ id: `vid-${nextId++}`, type: 'video', video: { type: 'file', file: { url: 'x' } } }) as any
const text = (content: string): NotionBlock =>
  ({
    id: `p-${nextId++}`,
    type: 'paragraph',
    paragraph: { rich_text: [{ plain_text: content }] },
  }) as any
const spacer = (): NotionBlock =>
  ({ id: `sp-${nextId++}`, type: 'paragraph', paragraph: { rich_text: [] } }) as any
const bullet = (): NotionBlock =>
  ({
    id: `li-${nextId++}`,
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ plain_text: 'item' }] },
  }) as any

const types = (grouped: ReturnType<typeof groupBlocks>) => grouped.map((item) => item.type)

describe('isSpacerParagraph', () => {
  it('treats an empty paragraph as a spacer', () => {
    expect(isSpacerParagraph(spacer())).toBe(true)
  })

  it('treats whitespace-only text as a spacer', () => {
    expect(isSpacerParagraph(text('   '))).toBe(true)
  })

  it('does not treat a paragraph with words as a spacer', () => {
    expect(isSpacerParagraph(text('a word'))).toBe(false)
  })

  it('does not treat a paragraph with nested children as a spacer', () => {
    const block = { ...spacer(), children: [text('nested')] } as any
    expect(isSpacerParagraph(block)).toBe(false)
  })
})

describe('groupBlocks', () => {
  it('leaves a lone image exactly where it was', () => {
    // The common case by a wide margin: 879 of the site's 1,038 images are a
    // single illustration between two paragraphs. Grouping must not touch it.
    const blocks = [text('before'), image(), text('after')]
    expect(types(groupBlocks(blocks))).toEqual(['paragraph', 'image', 'paragraph'])
  })

  it('groups two adjacent images into one row', () => {
    const grouped = groupBlocks([text('before'), image(), image(), text('after')])
    expect(types(grouped)).toEqual(['paragraph', 'asset_group', 'paragraph'])
    expect((grouped[1] as any).items).toHaveLength(2)
  })

  it('keeps a run going across Notion spacer paragraphs', () => {
    // Notion writes an empty paragraph every time the author presses return
    // twice. Between images that is whitespace, not a change of subject.
    const grouped = groupBlocks([image(), spacer(), image(), spacer(), image()])
    expect(types(grouped)).toEqual(['asset_group'])
    expect((grouped[0] as any).items).toHaveLength(3)
  })

  it('puts a held spacer back when the run turns out to be a single image', () => {
    // Dropping it would silently close up the gap the author left under a
    // lone photograph.
    expect(types(groupBlocks([image(), spacer(), text('after')]))).toEqual([
      'image',
      'paragraph',
      'paragraph',
    ])
  })

  it('ends a run at a paragraph with words in it', () => {
    const grouped = groupBlocks([image(), image(), text('a caption of sorts'), image(), image()])
    expect(types(grouped)).toEqual(['asset_group', 'paragraph', 'asset_group'])
  })

  it('does not fold a video into a row of photographs', () => {
    // A player sizes differently from a photograph; in a grid cell it reads as
    // a mistake. A video ends the run instead of joining it.
    expect(types(groupBlocks([image(), video(), image()]))).toEqual(['image', 'video', 'image'])
  })

  it('still groups list items, and closes a list when an image interrupts', () => {
    const grouped = groupBlocks([bullet(), bullet(), image(), image(), bullet()])
    expect(types(grouped)).toEqual(['list_group', 'asset_group', 'list_group'])
    expect((grouped[0] as any).items).toHaveLength(2)
  })

  it('flushes an open image run at the end of the block list', () => {
    expect(types(groupBlocks([text('before'), image(), image()]))).toEqual([
      'paragraph',
      'asset_group',
    ])
  })

  it('keeps every block it was given', () => {
    const blocks = [text('a'), image(), image(), spacer(), bullet(), video()]
    const flat = groupBlocks(blocks).flatMap((item: any) => item.items ?? [item])
    expect(flat.map((b: NotionBlock) => b.id)).toEqual(blocks.map((b) => b.id))
  })

  it('returns nothing for no blocks', () => {
    expect(groupBlocks([])).toEqual([])
  })
})
