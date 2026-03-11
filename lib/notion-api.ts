import { Client } from '@notionhq/client'
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})

export type NotionBlock = BlockObjectResponse & {
  children?: NotionBlock[]
}

export type NotionPage = PageObjectResponse

export async function getBlocks(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = []
  let cursor: string | undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      if ('type' in block) {
        const typedBlock = block as NotionBlock
        if (typedBlock.has_children) {
          typedBlock.children = await getBlocks(typedBlock.id)
        }
        blocks.push(typedBlock)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return blocks
}

export async function getBlocksShallow(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = []
  let cursor: string | undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      if ('type' in block) {
        blocks.push(block as NotionBlock)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return blocks
}

export async function getPage(pageId: string): Promise<NotionPage> {
  const page = await notion.pages.retrieve({ page_id: pageId })
  return page as NotionPage
}

export async function queryDatabase(
  databaseId: string,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>,
  filter?: any
): Promise<NotionPage[]> {
  const results: NotionPage[] = []
  let cursor: string | undefined

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      sorts,
      filter,
    })

    results.push(...(response.results as NotionPage[]))
    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return results
}

export async function searchNotion(query: string): Promise<NotionPage[]> {
  const response = await notion.search({
    query,
    filter: { property: 'object', value: 'page' },
    page_size: 20,
  })

  return response.results as NotionPage[]
}

// Helper to extract plain text title from a page
export function getPageTitle(page: NotionPage): string {
  const titleProp = Object.values(page.properties).find(
    (prop) => prop.type === 'title'
  )
  if (titleProp?.type === 'title') {
    return titleProp.title.map((t) => t.plain_text).join('')
  }
  return 'Untitled'
}

// Helper to extract a text property from a page
export function getPagePropertyText(page: NotionPage, name: string): string | null {
  const prop = page.properties[name]
  if (!prop) return null

  switch (prop.type) {
    case 'rich_text':
      return prop.rich_text.map((t) => t.plain_text).join('') || null
    case 'title':
      return prop.title.map((t) => t.plain_text).join('') || null
    case 'url':
      return prop.url
    case 'email':
      return prop.email
    case 'phone_number':
      return prop.phone_number
    case 'select':
      return prop.select?.name || null
    case 'date':
      return prop.date?.start || null
    default:
      return null
  }
}

// Helper to extract the cover image URL from a page
export function getPageCover(page: NotionPage): string | null {
  if (!page.cover) return null
  if (page.cover.type === 'external') return page.cover.external.url
  if (page.cover.type === 'file') return page.cover.file.url
  return null
}

// Helper to extract the icon from a page
export function getPageIcon(page: NotionPage): string | null {
  if (!page.icon) return null
  if (page.icon.type === 'emoji') return page.icon.emoji
  if (page.icon.type === 'external') return page.icon.external.url
  if (page.icon.type === 'file') return page.icon.file.url
  return null
}
