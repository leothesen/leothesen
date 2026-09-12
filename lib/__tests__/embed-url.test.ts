import { describe, expect, it } from 'vitest'

import { planEmbed } from '@/lib/embed-url'

/**
 * Most share links refuse to be framed, and a refused frame renders as an
 * empty box with no error anywhere. 27 of the site's embeds looked like that
 * before planEmbed existed, so every rewrite here is one that used to be blank.
 */

describe('planEmbed — Spotify', () => {
  it('rewrites a track share link to the compact player', () => {
    expect(planEmbed('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')).toEqual({
      kind: 'iframe',
      src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      height: 152,
      title: 'Spotify player',
    })
  })

  it('uses the compact player for episodes too', () => {
    const plan = planEmbed('https://open.spotify.com/episode/abc123')
    expect(plan).toMatchObject({ kind: 'iframe', height: 152 })
  })

  it('gives playlists and albums the full-height player', () => {
    // A tracklist cannot fit in 152px.
    expect(planEmbed('https://open.spotify.com/playlist/37i9dQZF1DX')).toMatchObject({
      src: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX',
      height: 352,
    })
    expect(planEmbed('https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX')).toMatchObject({
      height: 352,
    })
  })

  it('leaves a URL that is already an embed alone', () => {
    const url = 'https://open.spotify.com/embed/playlist/37i9dQZF1DX'
    expect(planEmbed(url)).toMatchObject({ kind: 'iframe', src: url })
  })

  it('treats www. the same as the bare host', () => {
    // hostOf strips www., so this should not fall through to the generic iframe.
    expect(planEmbed('https://www.open.spotify.com/track/abc')).toMatchObject({
      title: 'Spotify player',
    })
  })
})

describe('planEmbed — SoundCloud', () => {
  it('wraps a track in the widget player, dropping the query string', () => {
    const plan = planEmbed('https://soundcloud.com/artist/a-track?si=xyz&utm_source=clipboard')
    expect(plan.kind).toBe('iframe')
    if (plan.kind !== 'iframe') return

    const src = new URL(plan.src)
    expect(src.origin + src.pathname).toBe('https://w.soundcloud.com/player/')
    // Tracking params would otherwise be sent to SoundCloud's resolver.
    expect(src.searchParams.get('url')).toBe('https://soundcloud.com/artist/a-track')
    expect(plan.height).toBe(166)
  })

  it('gives a set the taller player', () => {
    expect(planEmbed('https://soundcloud.com/artist/sets/summer')).toMatchObject({ height: 450 })
  })

  it('falls back to a bookmark for the goo.gl share link', () => {
    // It redirects to soundcloud.com, but the player only resolves soundcloud.com URLs.
    expect(planEmbed('https://soundcloud.app.goo.gl/abc123')).toEqual({ kind: 'bookmark' })
  })
})

describe('planEmbed — TikTok', () => {
  it('rewrites a video link to the v2 embed', () => {
    expect(planEmbed('https://www.tiktok.com/@someone/video/7234567890123456789?lang=en')).toEqual({
      kind: 'iframe',
      src: 'https://www.tiktok.com/embed/v2/7234567890123456789',
      height: 740,
      title: 'TikTok video',
    })
  })

  it('bookmarks a TikTok link that is not a video', () => {
    // A profile page refuses framing and has no player to swap in.
    expect(planEmbed('https://www.tiktok.com/@someone')).toEqual({ kind: 'bookmark' })
  })
})

describe('planEmbed — everything else', () => {
  it('bookmarks hosts known to refuse framing', () => {
    expect(planEmbed('https://maggieappleton.com/garden-history')).toEqual({ kind: 'bookmark' })
  })

  it('keeps the generic iframe for anything unrecognised, URL untouched', () => {
    // The Garmin embeds are the bulk of the site's embeds and must not change.
    const garmin = 'https://connect.garmin.com/modern/activity/embed/123456789'
    expect(planEmbed(garmin)).toEqual({
      kind: 'iframe',
      src: garmin,
      height: 400,
      title: 'Embedded content',
    })
  })

  it('bookmarks a URL that cannot be parsed rather than framing it', () => {
    expect(planEmbed('not a url')).toEqual({ kind: 'bookmark' })
    expect(planEmbed('')).toEqual({ kind: 'bookmark' })
  })

  it('does not treat a lookalike host as Spotify', () => {
    expect(planEmbed('https://open.spotify.com.evil.example/track/abc')).toMatchObject({
      title: 'Embedded content',
    })
  })
})
