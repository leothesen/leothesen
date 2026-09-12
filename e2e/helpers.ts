import * as fs from 'fs'
import * as path from 'path'

import { expect, test as base, type Page } from '@playwright/test'
import sharp from 'sharp'

/**
 * Browser tests with the image optimizer taken out of the loop.
 *
 * Every `/_next/image` request is answered in the browser with a small real
 * PNG, so images still load, fire `onLoad` and come out of their blur. But
 * `next start` never encodes anything.
 *
 * Why: on a CI runner, the optimizer's AVIF encodes stalled everything else the
 * one server process does. Measured in the traces from the second and third CI
 * runs: a static JS chunk took 6.8s to serve while an in-memory API route
 * answered in 79ms, and client-side navigations that needed a chunk never
 * finished. Production never shares a process like that, since Vercel
 * optimizes images separately, so this was test-only load.
 *
 * The real optimizer path is still exercised once, by the crawl.
 */
const placeholderPng = sharp({ create: { width: 16, height: 9, channels: 3, background: '#8aa' } })
  .png()
  .toBuffer()

export const test = base.extend({
  context: async ({ context }, use) => {
    const body = await placeholderPng
    await context.route('**/_next/image?**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body })
    )
    await use(context)
  },
})

export { expect }

/**
 * Finding pages by what is on them, rather than hardcoding paths.
 *
 * The content changes daily with the Notion sync, so a test pinned to
 * /ocean/some-article breaks the day that article is renamed — for a reason
 * that has nothing to do with the site working. These read the committed
 * content, which is exactly what the build under test was made from.
 */

const CONTENT = path.join(process.cwd(), '.content')

interface ManifestPage {
  slugPath: string[]
  title: string
  icon: string | null
  cover: string | null
}

export const manifest: { slugTree: Record<string, { title: string }>; pages: Record<string, ManifestPage> } = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'manifest.json'), 'utf-8')
)

function blocksOf(id: string): any[] {
  const file = path.join(CONTENT, 'pages', id, 'blocks.json')
  if (!fs.existsSync(file)) return []
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return Array.isArray(raw) ? raw : raw.blocks || []
}

function some(blocks: any[], predicate: (block: any) => boolean): boolean {
  return blocks.some((b) => predicate(b) || some(b.children || [], predicate))
}

/** Published pages whose URL is not contested by a duplicate. */
export function publishedPages() {
  const counts = new Map<string, number>()
  for (const page of Object.values(manifest.pages)) {
    const key = page.slugPath.join('/')
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Object.entries(manifest.pages)
    .filter(([, p]) => p.slugPath.length > 0 && counts.get(p.slugPath.join('/')) === 1)
    .filter(([id]) => fs.existsSync(path.join(CONTENT, 'pages', id, 'blocks.json')))
    .map(([id, p]) => ({ id, path: '/' + p.slugPath.join('/'), title: p.title.trim(), depth: p.slugPath.length }))
}

/** The first published page whose blocks satisfy the predicate. */
export function findPage(predicate: (block: any) => boolean) {
  const page = publishedPages().find(({ id }) => some(blocksOf(id), predicate))
  if (!page) throw new Error('No page in .content matches — the content changed; update the predicate')
  return page
}

/**
 * Waits until React has hydrated the page.
 *
 * Clicking before hydration is the classic e2e flake: the element is visible
 * and the click lands, but no handler is attached yet so nothing happens. The
 * footer's theme toggle is only rendered after mount, so its presence is a
 * signal owned by this site rather than by Next's internals.
 */
export async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: /^Switch to (dark|light) mode$/ })).toBeVisible()
}

/**
 * Opens a page and waits for it to hydrate — not for the `load` event.
 *
 * `load` also waits for every third-party embed and poster image, which is
 * the internet's speed rather than the site's. A gallery page blew a 30s test
 * budget that way on CI. Nothing here needs everything loaded; hydration is
 * the thing the tests depend on.
 */
export async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
}

/**
 * Collects uncaught exceptions and React errors for the life of the page.
 *
 * Playwright does not surface the browser console on its own, so a hydration
 * mismatch — which React recovers from in production with only a console
 * error — would otherwise be invisible to every test.
 */
export function watchForErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/Minified React error|Hydration|did not match|hydrat/i.test(text)) errors.push(`console: ${text}`)
  })
  return errors
}
