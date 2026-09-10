/**
 * Works out how a Notion `embed` block's URL should actually be rendered.
 *
 * Notion stores whatever URL was pasted, which for most platforms is the
 * ordinary share link — and those share pages refuse to be framed. Measured
 * against the live site (Sep 2026):
 *
 *   soundcloud.com/…                 X-Frame-Options: SAMEORIGIN
 *   open.spotify.com/track/…         frame-ancestors 'self' …
 *   tiktok.com/@user/video/…         X-Frame-Options: SAMEORIGIN
 *   maggieappleton.com/…             X-Frame-Options: SAMEORIGIN
 *
 * 27 of the site's 84 embeds were affected — they rendered as empty boxes.
 * Each of those platforms publishes a separate player URL that *is* frameable,
 * so where one exists we rewrite to it; where none does, we fall back to a
 * bookmark card rather than framing a page that can never load.
 *
 * Anything not recognised here keeps the previous generic treatment, so the 48
 * Garmin embeds and the rest are untouched.
 */

export type EmbedPlan =
  | { kind: 'iframe'; src: string; height: number; title: string }
  | { kind: 'bookmark' }

// Heights come from each platform's own embed documentation.
const SPOTIFY_COMPACT = new Set(['track', 'episode'])
const SPOTIFY_COMPACT_HEIGHT = 152
const SPOTIFY_FULL_HEIGHT = 352
const SOUNDCLOUD_TRACK_HEIGHT = 166
const SOUNDCLOUD_SET_HEIGHT = 450
const TIKTOK_HEIGHT = 740
const GENERIC_HEIGHT = 400

// Hosts that refuse framing and publish no embeddable player we can construct
// from the URL alone. The goo.gl short link 302s to soundcloud.com, and
// SoundCloud's player resolver only accepts soundcloud.com URLs.
const NO_EMBED_AVAILABLE = new Set(['maggieappleton.com', 'soundcloud.app.goo.gl'])

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, '')
}

export function planEmbed(rawUrl: string): EmbedPlan {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { kind: 'bookmark' }
  }

  const host = hostOf(url)

  if (NO_EMBED_AVAILABLE.has(host)) {
    return { kind: 'bookmark' }
  }

  if (host === 'open.spotify.com') {
    // /track/<id> -> /embed/track/<id>. Already-embed URLs are left alone.
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] === 'embed') {
      return { kind: 'iframe', src: url.toString(), height: SPOTIFY_FULL_HEIGHT, title: 'Spotify player' }
    }
    const [type, id] = segments
    if (type && id) {
      return {
        kind: 'iframe',
        src: `https://open.spotify.com/embed/${type}/${id}`,
        height: SPOTIFY_COMPACT.has(type) ? SPOTIFY_COMPACT_HEIGHT : SPOTIFY_FULL_HEIGHT,
        title: 'Spotify player',
      }
    }
  }

  if (host === 'soundcloud.com') {
    // SoundCloud resolves the original URL server-side inside its player.
    const isSet = url.pathname.includes('/sets/')
    const clean = `https://soundcloud.com${url.pathname}`
    return {
      kind: 'iframe',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%23ff5500&hide_related=true&show_comments=false&show_teaser=false`,
      height: isSet ? SOUNDCLOUD_SET_HEIGHT : SOUNDCLOUD_TRACK_HEIGHT,
      title: 'SoundCloud player',
    }
  }

  if (host === 'tiktok.com') {
    const id = url.pathname.match(/\/video\/(\d+)/)?.[1]
    if (id) {
      return {
        kind: 'iframe',
        src: `https://www.tiktok.com/embed/v2/${id}`,
        height: TIKTOK_HEIGHT,
        title: 'TikTok video',
      }
    }
    return { kind: 'bookmark' }
  }

  return { kind: 'iframe', src: rawUrl, height: GENERIC_HEIGHT, title: 'Embedded content' }
}
