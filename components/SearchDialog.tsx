import * as React from 'react'
import { useRouter } from 'next/router'

import type { SearchEntry } from '@/lib/types'

const MAX_RESULTS = 8

/**
 * Ranks a page against the query.
 *
 * Deliberately plain substring scoring rather than a fuzzy-match dependency:
 * with a couple of hundred pages the ranking people actually want is "title
 * starts with what I typed", and fuzzy matching mostly adds surprising hits.
 * Returns null when the page does not match at all.
 */
function score(entry: SearchEntry, query: string): number | null {
  const q = query.toLowerCase()
  const title = entry.t.toLowerCase()

  if (title === q) return 0
  if (title.startsWith(q)) return 1
  // A word inside the title, e.g. "surf" in "Lazy surf Saturday".
  if (title.includes(` ${q}`)) return 2
  if (title.includes(q)) return 3
  if (entry.p.toLowerCase().includes(q)) return 4
  if (entry.d?.toLowerCase().includes(q)) return 5
  return null
}

function search(entries: SearchEntry[], query: string): SearchEntry[] {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  return entries
    .map((entry) => ({ entry, rank: score(entry, trimmed) }))
    .filter((r): r is { entry: SearchEntry; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.entry.t.length - b.entry.t.length)
    .slice(0, MAX_RESULTS)
    .map((r) => r.entry)
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [entries, setEntries] = React.useState<SearchEntry[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Fetched once, on first open, and kept for the rest of the session.
  React.useEffect(() => {
    if (!open || entries) return
    let cancelled = false
    fetch('/api/search-index')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setEntries([]) })
    return () => { cancelled = true }
  }, [open, entries])

  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      inputRef.current?.focus()
    }
  }, [open])

  const results = React.useMemo(
    () => (entries ? search(entries, query) : []),
    [entries, query]
  )

  React.useEffect(() => { setActive(0) }, [query])

  const go = React.useCallback(
    (entry: SearchEntry) => {
      onClose()
      router.push(entry.p)
    },
    [onClose, router]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active])
    }
  }

  if (!open) return null

  return (
    <div
      className='notion-search-backdrop'
      onClick={onClose}
      role='presentation'
    >
      <div
        className='notion-search-dialog'
        role='dialog'
        aria-modal='true'
        aria-label='Search this site'
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className='notion-search-input'
          type='search'
          value={query}
          placeholder='Search…'
          aria-label='Search this site'
          aria-controls='notion-search-results'
          autoComplete='off'
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <ul className='notion-search-results' id='notion-search-results' role='listbox'>
          {results.map((entry, i) => (
            <li key={entry.p}>
              <button
                type='button'
                role='option'
                aria-selected={i === active}
                className={
                  'notion-search-result' + (i === active ? ' notion-search-result-active' : '')
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => go(entry)}
              >
                <span className='notion-search-result-title'>{entry.t}</span>
                <span className='notion-search-result-path'>{entry.p}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className='notion-search-status' role='status'>
          {query.trim().length < 2
            ? 'Type at least two characters'
            : results.length === 0
              ? `No pages match “${query.trim()}”`
              : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  )
}

/** Opens on ⌘K / Ctrl-K, and on "/" when you are not already typing. */
export function useSearchHotkey(onOpen: () => void) {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpen()
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}
