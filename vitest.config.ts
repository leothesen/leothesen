import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // tsconfig says `jsx: preserve`, because Next does its own JSX transform.
  // Vite would honour that and hand raw JSX to the test runner, so the
  // component tests need the transform switched on here.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    globals: true,
    // Unit and component tests only. The browser suite in e2e/ runs under
    // Playwright against a production build — see playwright.config.ts.
    //
    // Nothing may live under pages/: Next treats every file there as a route,
    // so a test file would ship as a page and fail the build. Tests for pages
    // live in tests/pages/ instead.
    include: ['{lib,components}/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/components': path.resolve(__dirname, 'components'),
      '@/styles': path.resolve(__dirname, 'styles'),
    },
  },
})
