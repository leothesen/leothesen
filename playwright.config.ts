import { defineConfig, devices } from '@playwright/test'

/**
 * Browser and HTTP tests against a production build.
 *
 * Deliberately `next start` rather than `next dev`: this site is statically
 * generated, and the things worth testing here — real 404 status codes,
 * security headers, prerendered HTML, hydration — only behave like production
 * in a production build. Run `pnpm build` first; `pnpm test:e2e` does not.
 *
 * An unusual port, and never reusing a running server, so a dev server left
 * running on 3000 is not what gets tested.
 */

const PORT = Number(process.env.E2E_PORT || 3107)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries. A retry that passes turns a flaky test green and hides it;
  // a red run is the signal to fix the test or the site.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /crawl\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /crawl\.spec\.ts/ },
    {
      // The crawl fires hundreds of requests at the one `next start` process.
      // Run alongside the browser tests, it starved them: a client-side
      // navigation's data request went unanswered for 10s and the test failed
      // with a page that was working fine. So it runs once they are done.
      name: 'crawl',
      testMatch: /crawl\.spec\.ts/,
      dependencies: ['desktop', 'mobile'],
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
