import { afterEach } from 'vitest'

// Component tests opt into jsdom per file with `// @vitest-environment jsdom`;
// everything else runs in plain Node. Testing Library only auto-cleans when it
// can see a global `afterEach` *and* is imported, so unmount explicitly rather
// than relying on the order those happen in.
afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
