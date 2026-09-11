import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'

import { getManifest } from '@/lib/notion-local'

/**
 * Integrity checks over the committed `.content` tree.
 *
 * The site's content is data in the repo, so it can rot in ways type checking
 * and unit tests never see: a page synced without its directory, a cross-link
 * to a page that has since been deleted, two pages claiming one URL. Every
 * case below is one that has actually gone wrong here.
 *
 * These complement the unit tests on lib/* rather than repeat them — nothing
 * here mocks anything, it reads what is actually committed.
 */

const CONTENT_DIR = path.join(process.cwd(), '.content')
const PAGES_DIR = path.join(CONTENT_DIR, 'pages')

const manifest = getManifest()
const manifestIds = Object.keys(manifest.pages)

function readBlocks(pageId: string): any[] {
  const file = path.join(PAGES_DIR, pageId, 'blocks.json')
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? parsed : parsed.blocks || []
  } catch {
    return []
  }
}

function readBlocksRaw(pageId: string): string {
  const file = path.join(PAGES_DIR, pageId, 'blocks.json')
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf-8')
}

function readMeta(pageId: string): { icon?: unknown; cover?: unknown } | null {
  const file = path.join(PAGES_DIR, pageId, 'meta.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function walk(blocks: any[], visit: (block: any) => void) {
  for (const block of blocks || []) {
    visit(block)
    if (block.children) walk(block.children, visit)
  }
}

describe('manifest', () => {
  it('has pages', () => {
    expect(manifestIds.length).toBeGreaterThan(100)
  })

  it('gives every page a title', () => {
    const untitled = manifestIds.filter((id) => !manifest.pages[id].title?.trim())
    expect(untitled).toEqual([])
  })

  it('gives every non-root page a slug path', () => {
    const rootless = manifestIds.filter(
      (id) => !Array.isArray(manifest.pages[id].slugPath)
    )
    expect(rootless).toEqual([])
  })

  it('uses URL-safe slug segments', () => {
    const offenders: string[] = []
    for (const id of manifestIds) {
      for (const segment of manifest.pages[id].slugPath || []) {
        // Lowercase, digits, and single hyphens: anything else either needs
        // encoding in a URL or renders as a confusing one.
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) {
          offenders.push(`${manifest.pages[id].slugPath.join('/')} (segment "${segment}")`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('page URLs', () => {
  // Two Notion pages currently claim each of these, so only one is reachable.
  // The repair is in Notion — rename or delete the duplicate. Listed rather
  // than ignored so a *new* collision fails this test.
  const KNOWN_COLLISIONS = [
    'novel-experiences/a-return-to-indonesia/padang',
    'people/dinner-conversations/kassie',
    'people/dinner-conversations/mattea-dale',
  ]

  it('has no URL claimed by two pages, beyond the known duplicates', () => {
    const seen = new Map<string, string[]>()
    for (const id of manifestIds) {
      const slugPath = manifest.pages[id].slugPath
      if (!slugPath?.length) continue
      const key = slugPath.join('/')
      seen.set(key, [...(seen.get(key) || []), id])
    }

    const collisions = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key]) => key)
      .sort()

    expect(collisions).toEqual([...KNOWN_COLLISIONS].sort())
  })
})

describe('content on disk', () => {
  it('has a directory for every page in the manifest', () => {
    const missing = manifestIds.filter(
      (id) => !fs.existsSync(path.join(PAGES_DIR, id, 'blocks.json'))
    )
    expect(missing).toEqual([])
  })

  it('has a manifest entry for every directory on disk', () => {
    const orphans = fs
      .readdirSync(PAGES_DIR)
      .filter((dir) => !dir.startsWith('.'))
      .filter((dir) => !manifest.pages[dir])
    expect(orphans).toEqual([])
  })
})

describe('cross-references', () => {
  // A "Route archive" child page that exists in Notion but was never synced —
  // no manifest entry, no directory. It renders on the live site as
  // <a href="/9f89fcc3-…">Route archive</a>, a dead link to a raw UUID.
  // Listed rather than ignored so a *new* dangling reference fails this test.
  const KNOWN_DANGLING = [
    'mountains/cederberg-fastpack-2024 -> 9f89fcc303e241d080fcb01b8d2472da',
  ]

  it('points every child_page and link_to_page at a page we have', () => {
    const dangling: string[] = []

    for (const id of manifestIds) {
      walk(readBlocks(id), (block) => {
        let target: string | undefined
        if (block.type === 'child_page') {
          target = block.id
        } else if (block.type === 'link_to_page') {
          target = block.link_to_page?.page_id
        }
        if (!target) return

        const clean = target.replace(/-/g, '')
        // A database link is not a page and has no manifest entry.
        if (block.link_to_page?.database_id) return
        if (!manifest.pages[clean]) {
          dangling.push(`${manifest.pages[id].slugPath.join('/')} -> ${clean}`)
        }
      })
    }

    expect(dangling.sort()).toEqual([...KNOWN_DANGLING].sort())
  })
})

describe('image permanence', () => {
  // The sync copies Notion's images to Blob storage and rewrites the URLs to
  // point there. When that does not happen the manifest keeps Notion's own
  // signed S3 link, which expires — one of these is already a broken image on
  // the live site, and the rest will follow.
  //
  // `pnpm sync:images` re-uploads them. Listed rather than ignored so the set
  // can only shrink: a new one fails this test.
  // /engineering/llms-in-my-work-life/chatgpt-to-refactor-code, the one page
  // whose cover was never re-uploaded. The other twelve were repaired on disk
  // long ago; the manifest just never learned about it. See the projection
  // test below.
  const KNOWN_EXPIRING_COVERS = 1
  const KNOWN_EXPIRING_ICONS = 0
  // Six callout icons on /get-in-touch/cv (company logos) and one image block
  // each on /novel-experiences/sabbatical/travel-journal/{slowpacking,khotso}.
  const KNOWN_EXPIRING_BLOCK_URLS = 8

  const isExpiring = (url: string) =>
    /prod-files-secure\.s3|X-Amz-Credential|X-Amz-Expires/.test(url)

  it('has no more expiring cover URLs than the known set', () => {
    const expiring = manifestIds
      .map((id) => manifest.pages[id].cover)
      .filter((cover): cover is string => !!cover && isExpiring(cover))

    expect(expiring.length).toBeLessThanOrEqual(KNOWN_EXPIRING_COVERS)
  })

  // Icons were the gap: covers and block images were guarded, icons were not,
  // and one rotted without anything noticing. A page icon is the 80px circle
  // at the top of the page, so a dead one is conspicuous.
  it('has no more expiring icon URLs than the known set', () => {
    const expiring = manifestIds
      .map((id) => manifest.pages[id].icon)
      .filter((icon): icon is string => !!icon && isExpiring(icon))

    expect(expiring.length).toBeLessThanOrEqual(KNOWN_EXPIRING_ICONS)
  })

  // Counted over the raw JSON rather than by walking to `block.image`. That
  // walk only ever saw image blocks, so it reported 2 while 8 were rotting:
  // the six company logos on the CV are callout icons, a block shape it never
  // looked at. Any block type can carry a Notion file URL, so nothing here
  // should depend on guessing which ones do.
  it('has no more expiring URLs in blocks than the known set', () => {
    let expiring = 0
    for (const id of manifestIds) {
      const raw = readBlocksRaw(id)
      expiring += (raw.match(/https:\/\/prod-files-secure/g) || []).length
    }

    expect(expiring).toBeLessThanOrEqual(KNOWN_EXPIRING_BLOCK_URLS)
  })

  // The invariant that makes the counts above able to reach zero.
  //
  // The manifest used to hold its own copy of each page's icon and cover, and
  // the incremental sync carried that copy forward for every page Notion
  // reported unchanged. `imagesRepair()` fixes meta.json but does not make a
  // page look changed, so a repaired image was re-broken in the manifest on
  // the very next sync — twelve pages sat like that, correct on disk and dead
  // in the manifest, which is why nobody noticed and why the count only ever
  // grew.
  //
  // A strict equality rather than a known-set count: there is no legitimate
  // reason for these to differ, so any drift at all is the bug returning.
  it('keeps every manifest icon and cover equal to the page meta.json', () => {
    const drift: string[] = []

    for (const id of manifestIds) {
      const meta = readMeta(id)
      if (!meta) continue
      for (const field of ['icon', 'cover'] as const) {
        const inManifest = manifest.pages[id][field] ?? null
        const onDisk = (meta[field] as string | null | undefined) ?? null
        if (inManifest !== onDisk) {
          drift.push(`${manifest.pages[id].title} [${field}]`)
        }
      }
    }

    expect(drift).toEqual([])
  })
})

describe('asset URLs', () => {
  it('serves every image and embed over https', () => {
    const insecure: string[] = []

    for (const id of manifestIds) {
      walk(readBlocks(id), (block) => {
        const candidates = [
          block.image?.external?.url,
          block.image?.file?.url,
          block.embed?.url,
          block.video?.external?.url,
          block.video?.file?.url,
        ]
        for (const url of candidates) {
          if (typeof url === 'string' && url.startsWith('http://')) {
            insecure.push(`${manifest.pages[id].slugPath.join('/')}: ${url}`)
          }
        }
      })
    }

    expect(insecure).toEqual([])
  })
})
