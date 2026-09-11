import type { DatabaseEntry } from './types'
import type { CollectionStats } from './collection-stats'

/**
 * Kept apart from collection-stats.ts on purpose. That module reads the
 * content directory and so imports `fs`; this one is rendered in the browser.
 * Sharing a file would drag node built-ins into the client bundle.
 */

/** "2022" for a single year, "2022-2023" for a span, nothing for no dates. */
export function describeSpan(from: string | null, to: string | null): string | null {
  if (!from) return null
  const start = new Date(from).getFullYear()
  if (Number.isNaN(start)) return null
  const parsedEnd = to ? new Date(to).getFullYear() : start
  const end = Number.isNaN(parsedEnd) ? start : parsedEnd
  return start === end ? String(start) : `${start}–${end}`
}

/**
 * The one line under a card title that says what it opens into.
 *
 * "Sabbatical" and "Barrydale" were indistinguishable cards; one is 112 entries
 * and 614 photographs over two years, the other is a single page. The entry
 * count is dropped for a leaf page, where "1 entry" says nothing at all.
 */
export function describeCollection(
  entry: Pick<DatabaseEntry, 'stats'> & { stats?: CollectionStats | null }
): string | null {
  const stats = entry.stats
  if (!stats) return null

  const parts: string[] = []
  if (stats.pages > 1) parts.push(`${stats.pages} entries`)
  if (stats.photos > 0) {
    parts.push(`${stats.photos} ${stats.photos === 1 ? 'photo' : 'photos'}`)
  }
  const span = describeSpan(stats.from, stats.to)
  if (span) parts.push(span)

  return parts.length > 0 ? parts.join(' · ') : null
}
