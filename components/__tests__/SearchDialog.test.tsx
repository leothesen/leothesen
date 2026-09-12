// @vitest-environment jsdom
import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchDialog, useSearchHotkey } from '@/components/SearchDialog'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/router', () => ({ useRouter: () => ({ push }) }))

const INDEX = [
  { t: 'Ocean', p: '/ocean' },
  { t: 'Surf', p: '/ocean/surf' },
  { t: 'Surfing in Indonesia', p: '/ocean/surfing-in-indonesia' },
  { t: 'Lazy surf Saturday', p: '/ocean/lazy-surf-saturday' },
  { t: 'Nosurfing', p: '/misc/nosurfing' },
  { t: 'Trip report', p: '/mountains/surf-adjacent-trip' },
  { t: 'Cederberg', p: '/mountains/cederberg', d: 'Fastpacking, and some surf on the way home' },
  { t: 'Kassie', p: '/people/kassie' },
]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  push.mockReset()
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => INDEX }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function Harness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = React.useState(initiallyOpen)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <SearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

const input = () => screen.getByRole('searchbox', { name: 'Search this site' })
const titles = () => screen.queryAllByRole('option').map((o) => o.querySelector('.notion-search-result-title')!.textContent)
const status = () => screen.getByRole('status').textContent

async function type(value: string) {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  // Let the index land before typing, as it would for a real reader.
  await act(async () => {})
  fireEvent.change(input(), { target: { value } })
}

describe('SearchDialog', () => {
  it('renders nothing and fetches nothing while closed', () => {
    render(<Harness initiallyOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the index once, on first open, and keeps it across reopens', async () => {
    render(<Harness />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search-index'))

    fireEvent.keyDown(input(), { key: 'Escape' })
    fireEvent.click(screen.getByText('open'))
    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('focuses the input on open', async () => {
    render(<Harness />)
    await waitFor(() => expect(document.activeElement).toBe(input()))
  })

  it('asks for two characters before searching', async () => {
    render(<Harness />)
    await type('s')
    expect(titles()).toEqual([])
    expect(status()).toBe('Type at least two characters')
  })

  it('ranks exact title, then prefix, word, substring, path, then description', async () => {
    render(<Harness />)
    await type('  surf ')

    expect(titles()).toEqual([
      'Surf', // exact
      'Surfing in Indonesia', // prefix
      'Lazy surf Saturday', // word inside the title
      'Nosurfing', // substring
      'Trip report', // path only
      'Cederberg', // description only
    ])
    expect(status()).toBe('6 results')
  })

  it('says so when nothing matches', async () => {
    render(<Harness />)
    await type('zzz')
    expect(status()).toBe('No pages match “zzz”')
  })

  it('caps the list at eight results', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => Array.from({ length: 20 }, (_, i) => ({ t: `Swell ${i}`, p: `/ocean/swell-${i}` })),
    }))
    render(<Harness />)
    await type('swell')
    expect(titles()).toHaveLength(8)
  })

  it('moves the selection with the arrow keys, without running off either end', async () => {
    render(<Harness />)
    await type('surf')
    const selected = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true')

    expect(selected()).toBe(0)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(selected()).toBe(0)
    for (let i = 0; i < 10; i++) fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(selected()).toBe(5)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(selected()).toBe(4)
  })

  it('goes to the selected page on Enter and closes', async () => {
    render(<Harness />)
    await type('surf')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(push).toHaveBeenCalledWith('/ocean/surfing-in-indonesia')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('goes to a result on click', async () => {
    render(<Harness />)
    await type('kassie')
    fireEvent.click(screen.getByRole('option'))
    expect(push).toHaveBeenCalledWith('/people/kassie')
  })

  it('closes on Escape and on a click outside, but not on a click inside', async () => {
    render(<Harness />)
    await type('surf')

    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeNull()

    fireEvent.click(document.querySelector('.notion-search-backdrop')!)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByText('open'))
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clears the previous query when reopened', async () => {
    render(<Harness />)
    await type('surf')
    fireEvent.keyDown(input(), { key: 'Escape' })
    fireEvent.click(screen.getByText('open'))
    expect(input()).toHaveProperty('value', '')
  })

  it('degrades to "no matches" when the index cannot be fetched', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    render(<Harness />)
    await type('surf')
    expect(status()).toBe('No pages match “surf”')
  })

  it('treats a non-OK index response as empty', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'x' }) }))
    render(<Harness />)
    await type('surf')
    expect(titles()).toEqual([])
  })
})

describe('useSearchHotkey', () => {
  function HotkeyHarness({ onOpen }: { onOpen: () => void }) {
    useSearchHotkey(onOpen)
    return (
      <>
        <input aria-label="elsewhere" />
        <div contentEditable suppressContentEditableWarning aria-label="editor" />
      </>
    )
  }

  it('opens on ⌘K and Ctrl-K', () => {
    const onOpen = vi.fn()
    render(<HotkeyHarness onOpen={onOpen} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('opens on "/" but not a plain "k"', () => {
    const onOpen = vi.fn()
    render(<HotkeyHarness onOpen={onOpen} />)
    fireEvent.keyDown(window, { key: 'k' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('leaves "/" alone while typing in a field', () => {
    const onOpen = vi.fn()
    render(<HotkeyHarness onOpen={onOpen} />)
    fireEvent.keyDown(screen.getByLabelText('elsewhere'), { key: '/' })
    expect(onOpen).not.toHaveBeenCalled()
    // ⌘K still works from inside a field — it is not a character anyone types.
    fireEvent.keyDown(screen.getByLabelText('elsewhere'), { key: 'k', metaKey: true })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
