import { expect, test } from '@playwright/test'

import { findPage, publishedPages, visit, watchForErrors } from './helpers'

/**
 * What a reader actually does, in a real browser, on the production build.
 *
 * Everything here depends on hydration — search, the theme toggle, the lazy
 * YouTube player, images coming out of their blur — and none of it is visible
 * to a server render, which is why it lives here and not in the unit suite.
 */

const article = () => publishedPages().find((p) => p.depth >= 2)!

test('the home page, an article, the archive and a 404 all hydrate without errors', async ({ page }) => {
  const errors = watchForErrors(page)

  for (const path of ['/', article().path, '/archive']) {
    await visit(page, path)
    await expect(page.locator('h1')).toHaveCount(1)
  }

  await page.goto('/no-such-page', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible()

  expect(errors).toEqual([])
})

test('search opens from the keyboard and takes you to the page', async ({ page }) => {
  const target = article()
  await visit(page, '/')

  await page.keyboard.press('/')
  const input = page.getByRole('searchbox', { name: 'Search this site' })
  await expect(input).toBeFocused()

  await input.fill(target.title)
  // Matched on the exact path: a section's path is a prefix of all its
  // children's, so a substring match finds the whole section.
  const resultPaths = page.locator('.notion-search-result-path')
  await expect(resultPaths.getByText(target.path, { exact: true })).toBeVisible()

  // Arrow down to that result rather than trusting it ranks first; two pages
  // can share a title.
  const index = (await resultPaths.allTextContents()).indexOf(target.path)
  for (let i = 0; i < index; i++) await input.press('ArrowDown')
  await expect(page.getByRole('option', { selected: true })).toContainText(target.path)
  await input.press('Enter')

  await expect(page).toHaveURL(target.path)
  await expect(page.locator('h1.notion-title')).toHaveText(target.title)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('search opens from the header button and closes on Escape', async ({ page }) => {
  await visit(page, '/')

  await page.getByRole('button', { name: 'Search this site' }).click()
  await expect(page.getByRole('dialog', { name: 'Search this site' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the theme toggle switches theme and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await visit(page, '/')

  const html = page.locator('html')
  await expect(html).not.toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(html).toHaveClass(/\bdark\b/)
})

test('the skip link is the first stop and lands in the article', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'no keyboard on a phone')
  await visit(page, article().path)

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#notion-content')).toBeFocused()
})

test('breadcrumbs and neighbour links navigate', async ({ page }) => {
  const nested = publishedPages().find((p) => p.depth >= 2)!
  await visit(page, nested.path)

  const neighbours = page.getByRole('navigation', { name: 'Nearby pages' })
  if (await neighbours.count()) {
    const link = neighbours.getByRole('link').first()
    const href = await link.getAttribute('href')
    const title = await link.locator('.notion-neighbour-title').textContent()
    await link.click()
    await expect(page).toHaveURL(href!)
    // The URL changes before the new page renders, and the old page has an
    // <h1> too — so wait for this page's own title, not just any heading.
    await expect(page.locator('h1.notion-title')).toHaveText(title!.trim())
  }

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
  await crumbs.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL('/')
})

test('the footer reaches the archive, which lists pages newest first', async ({ page }) => {
  await visit(page, '/')
  await page.getByRole('link', { name: 'Archive' }).click()

  await expect(page).toHaveURL('/archive')
  // The URL changes before the archive renders. Wait for its own heading, or
  // the lookup below reads the home page and finds no years — which is how
  // this failed on its first CI run.
  await expect(page.locator('h1.notion-title')).toHaveText('Archive')
  await expect(page.locator('section.notion-archive-year').first()).toBeVisible()
  const years = await page.locator('section.notion-archive-year h2').evaluateAll((els) =>
    els.map((el) => el.firstChild!.textContent!.trim())
  )
  expect(years.length).toBeGreaterThan(1)
  expect([...years].sort().reverse()).toEqual(years)
})

test('YouTube stays a poster until played', async ({ page }) => {
  const withVideo = findPage((b) => b.type === 'video' && /youtu/.test(b.video?.external?.url || ''))
  await visit(page, withVideo.path)

  const embed = page.locator('.notion-youtube').first()
  await embed.scrollIntoViewIfNeeded()
  // No YouTube player JavaScript before someone asks for it.
  await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0)

  await embed.getByRole('button', { name: /^Play video/ }).click()
  await expect(embed.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?autoplay=1$/)
})

test('loaded images are never left blurred', async ({ page }) => {
  // The failure this guards: an image finished loading before hydration, its
  // load handler never ran, and it stayed blurred for good. Only images that
  // really loaded are checked, so a slow network cannot fail the test.
  const withImages = findPage((b) => b.type === 'image')
  await visit(page, withImages.path)

  // At least one article image has to have loaded, or the check below passes
  // on an empty set. Not the page `load` event: that waits for every image on
  // the page, including ones far below the fold.
  const loaded = page.locator('img.notion-image')
  await expect
    .poll(() => loaded.evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth > 0).length), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)

  await expect
    .poll(
      () =>
        page.locator('img').evaluateAll((imgs) =>
          (imgs as HTMLImageElement[])
            .filter((img) => img.complete && img.naturalWidth > 0)
            .filter((img) => img.classList.contains('notion-image-loading'))
            .map((img) => img.currentSrc || img.src)
        ),
      { timeout: 10_000 }
    )
    .toEqual([])
})

test('no page scrolls sideways on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'layout check for narrow screens')
  for (const path of ['/', '/archive', article().path]) {
    await visit(page, path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, path).toBeLessThanOrEqual(1)
  }
})
