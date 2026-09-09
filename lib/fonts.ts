import localFont from 'next/font/local'

/**
 * Inter, self-hosted from public/fonts.
 *
 * Both files have been sitting in the repo unused since the site was built —
 * nothing loaded them, so every page rendered in the system UI font. next/font
 * fingerprints and preloads them, and `display: swap` means text is readable
 * while they arrive.
 */
export const inter = localFont({
  src: [
    { path: '../public/fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../public/fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
})
