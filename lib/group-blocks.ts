import type { NotionBlock } from './notion-api'

export type ListGroup = { type: 'list_group'; listType: string; items: NotionBlock[] }
export type AssetGroup = { type: 'asset_group'; items: NotionBlock[] }
export type Grouped = NotionBlock | ListGroup | AssetGroup

/**
 * An empty paragraph — Notion's spacer.
 *
 * It carries no text and nothing nested under it, and the editor emits one
 * every time you press return twice. Between two images it is whitespace, not
 * a change of subject, so it must not break a run of them.
 */
export function isSpacerParagraph(block: NotionBlock): boolean {
  if (block.type !== 'paragraph') return false
  if ((block as any).children?.length) return false
  const richText = (block as any).paragraph?.rich_text || []
  return !richText.some((run: any) => run?.plain_text?.trim())
}

/**
 * Groups consecutive blocks that belong together: list items into one list,
 * and adjacent images into one row.
 *
 * The image half is deliberately narrow. Of the 1,038 images on the site, 879
 * stand alone between two paragraphs — they illustrate a sentence, and putting
 * those in a grid would break the pairing the writing depends on. The other
 * 159, spread over 45 pages, were placed back to back, which is the author
 * saying "these go together". Only those are grouped.
 *
 * Videos are not folded in: an iframe player in a row of photographs sizes
 * differently and reads as a mistake, so one ends a run rather than joining it.
 */
export function groupBlocks(blocks: NotionBlock[]): Grouped[] {
  const grouped: Grouped[] = []
  let currentList: ListGroup | null = null
  let currentAssets: NotionBlock[] = []
  // Spacers seen while a run is open. If the run continues they are dropped —
  // the grid supplies its own gap. If it ends, they are put back, so a lone
  // image keeps exactly the vertical rhythm it had before.
  let heldSpacers: NotionBlock[] = []

  const flushList = () => {
    if (currentList) grouped.push(currentList)
    currentList = null
  }

  const flushAssets = () => {
    if (currentAssets.length >= 2) {
      grouped.push({ type: 'asset_group', items: currentAssets })
    } else {
      grouped.push(...currentAssets)
    }
    // Spacers still held when the run ends came after its last image, so they
    // go back. Ones between two images were cleared the moment the run
    // continued. The result is that grouping never drops a block — a property
    // worth keeping, and one the tests assert directly.
    grouped.push(...heldSpacers)
    currentAssets = []
    heldSpacers = []
  }

  for (const block of blocks) {
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      flushAssets()
      if (currentList && currentList.listType === block.type) {
        currentList.items.push(block)
      } else {
        flushList()
        currentList = { type: 'list_group', listType: block.type, items: [block] }
      }
      continue
    }

    if (block.type === 'image') {
      flushList()
      heldSpacers = []
      currentAssets.push(block)
      continue
    }

    if (currentAssets.length > 0 && isSpacerParagraph(block)) {
      heldSpacers.push(block)
      continue
    }

    flushList()
    flushAssets()
    grouped.push(block)
  }

  flushList()
  flushAssets()
  return grouped
}
