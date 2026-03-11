/**
 * Utility functions for working with Notion IDs and data.
 * Replaces the unofficial notion-utils package.
 */

export function parsePageId(id: string | null | undefined, opts?: { uuid?: boolean }): string | null {
  if (!id) return null

  // Remove URL parts if it's a full Notion URL
  id = id.split('?')[0]
  const parts = id.split('/')
  id = parts[parts.length - 1]

  // Extract 32-char hex ID (with or without dashes)
  const clean = id.replace(/-/g, '')
  const match = clean.match(/([a-f0-9]{32})$/i)
  if (!match) return null

  const hex = match[1]
  if (opts?.uuid) {
    return idToUuid(hex)
  }
  return hex
}

export function idToUuid(id: string): string {
  const hex = id.replace(/-/g, '')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function uuidToId(uuid: string): string {
  return uuid.replace(/-/g, '')
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatDate(dateString: string, opts?: { month?: string }): string {
  const date = new Date(dateString)
  const month = opts?.month === 'long' ? 'long' : 'short'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month,
    day: 'numeric',
  })
}
