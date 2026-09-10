/**
 * Content Security Policy.
 *
 * Deliberately not locking `frame-src` to a host list. The embeds come from
 * whatever URL gets pasted into Notion — there are already Garmin, Spotify,
 * SoundCloud, TikTok, Cal.com, PostHog and chilipepper.io frames in the
 * content — so a host allowlist would silently blank out the next embed added
 * and give no clue why. `https:` still forces every frame off plaintext, which
 * is the property worth having here.
 *
 * `unsafe-inline` is required for both scripts and styles: Next inlines its
 * hydration bootstrap, and styled-jsx and the renderer both emit inline style
 * attributes. Removing it needs per-request nonces, which static export cannot
 * do — so this is the honest ceiling for a fully static site.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://*.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  'frame-src https:',
  "connect-src 'self' https://*.posthog.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  // The genuinely cheap wins: no plugins, no <base> hijacking, no posting the
  // page's forms to somebody else's origin, and nobody may frame this site.
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the full URL within the site, only the origin off-site.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs any of these, so decline them all up front.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

/** @type {import('next').NextConfig} */
module.exports = {
  staticPageGenerationTimeout: 300,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.notion.so' },
      { protocol: 'https', hostname: 'notion.so' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'abs.twimg.com' },
      { protocol: 'https', hostname: 's3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 'leothesen.com' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
}
