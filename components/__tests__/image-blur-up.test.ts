import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const COMPONENTS_DIR = path.resolve(__dirname, '..')

function componentSources(dir: string): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...componentSources(full))
    } else if (entry.name.endsWith('.tsx')) {
      out.push({ file: path.relative(COMPONENTS_DIR, full), source: readFileSync(full, 'utf8') })
    }
  }
  return out
}

const SOURCES = componentSources(COMPONENTS_DIR)

// A className that contains the blur class, e.g. `className="notion-image ...
// notion-image-loading"`. Deliberately not the `classList.remove(...)` calls,
// which name the same class but are the cure rather than the symptom.
const BLURRED_ELEMENT = /className="[^"]*\bnotion-image-loading\b[^"]*"/g
const TAG_OPENER = /<(img|Image)\b/g

/** The `<img` or `<Image` tag that a given position in the source sits inside. */
function owningTag(source: string, position: number): string | null {
  let tag: string | null = null
  for (const match of source.matchAll(TAG_OPENER)) {
    if (match.index! > position) break
    tag = match[1]
  }
  return tag
}

describe('blur-up images', () => {
  // Guarding a bug that reached the live site. `notion-image-loading` applies
  // `filter: blur(20px)` and ships in the server-rendered HTML; the only thing
  // that takes it off is a load handler. A bare <img> that finishes loading
  // before React hydrates has already fired `load`, so the handler never runs
  // and the image stays blurred for the life of the page — it comes right only
  // on a client-side navigation, which re-renders it with the handler already
  // attached. That is precisely what the homepage avatar did.
  //
  // next/image checks `img.complete` in its ref callback for exactly this
  // case, and re-assigns `src` on mount when an `onError` is supplied so a
  // pre-hydration failure is not swallowed either. Nothing else on the page
  // does, so the blur belongs to next/image alone.
  it('starts blurred only where next/image can un-blur it', () => {
    const bare: string[] = []

    for (const { file, source } of SOURCES) {
      for (const match of source.matchAll(BLURRED_ELEMENT)) {
        if (owningTag(source, match.index!) !== 'Image') {
          const line = source.slice(0, match.index).split('\n').length
          bare.push(`${file}:${line}`)
        }
      }
    }

    expect(bare).toEqual([])
  })

  it('still has blur-up images to guard', () => {
    // Without this the test above passes just as happily if the class is
    // renamed or the effect dropped, and the guard quietly stops guarding.
    const blurred = SOURCES.flatMap(({ source }) => [...source.matchAll(BLURRED_ELEMENT)])

    expect(blurred.length).toBeGreaterThanOrEqual(4)
  })
})
