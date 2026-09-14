// @vitest-environment jsdom
import * as React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CalEmbed } from '@/components/CalEmbed'
import { YouTubeEmbed } from '@/components/YouTubeEmbed'

describe('CalEmbed', () => {
  const URL_15MIN = 'https://cal.com/leo-thesen/15min'

  function mount(url = URL_15MIN) {
    const utils = render(<CalEmbed url={url} />)
    const frame = utils.container.querySelector('iframe')
    return { ...utils, frame }
  }

  function post(frame: HTMLIFrameElement | null, data: unknown, { origin = 'https://cal.com', source = frame?.contentWindow } = {}) {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }))
    })
  }

  const dimension = (iframeHeight: unknown) => ({ originator: 'CAL', type: '__dimensionChanged', data: { iframeHeight } })

  it('switches Cal into embed mode with the month layout', () => {
    const src = new URL(mount().frame!.getAttribute('src')!)
    expect(src.origin + src.pathname).toBe(URL_15MIN)
    // `embed` is what makes Cal broadcast its height at all.
    expect(src.searchParams.has('embed')).toBe(true)
    expect(src.searchParams.get('layout')).toBe('month_view')
  })

  it('keeps a layout that was chosen in Notion', () => {
    const src = new URL(mount(`${URL_15MIN}?layout=week_view`).frame!.getAttribute('src')!)
    expect(src.searchParams.get('layout')).toBe('week_view')
  })

  it('starts at a fallback height and follows the height Cal reports', () => {
    const { frame } = mount()
    expect(frame!.style.height).toBe('560px')

    post(frame, dimension(1030.2))
    expect(frame!.style.height).toBe('1031px')
  })

  it('accepts the message as a JSON string too', () => {
    const { frame } = mount()
    post(frame, JSON.stringify(dimension(700)))
    expect(frame!.style.height).toBe('700px')
  })

  it('ignores messages from any other origin', () => {
    // Any page can postMessage this window; only Cal gets to resize the frame.
    const { frame } = mount()
    post(frame, dimension(9999), { origin: 'https://evil.example' })
    expect(frame!.style.height).toBe('560px')
  })

  it('ignores a cal.com message that did not come from this frame', () => {
    const { frame } = mount()
    post(frame, dimension(9999), { source: window })
    expect(frame!.style.height).toBe('560px')
  })

  it('ignores other Cal events and nonsense heights', () => {
    const { frame } = mount()
    post(frame, { originator: 'CAL', type: 'bookingSuccessful', data: { iframeHeight: 50 } })
    post(frame, { originator: 'OTHER', type: '__dimensionChanged', data: { iframeHeight: 50 } })
    post(frame, dimension(0))
    post(frame, dimension('tall'))
    post(frame, 'not json')
    expect(frame!.style.height).toBe('560px')
  })

  it('stops listening once unmounted', () => {
    const { frame, unmount } = mount()
    unmount()
    // Would throw a React state-update warning path if still subscribed; the
    // assertion is simply that nothing blows up.
    expect(() => post(frame, dimension(800))).not.toThrow()
  })

  it('falls back to a plain link for a URL it cannot parse', () => {
    const { container } = render(<CalEmbed url="cal.com/leo-thesen" />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('a')!.getAttribute('href')).toBe('cal.com/leo-thesen')
  })
})

describe('YouTubeEmbed', () => {
  it('shows only a poster until someone presses play', () => {
    const { container } = render(<YouTubeEmbed id="dQw4w9WgXcQ" title="Sabbatical intro" />)
    // The whole point: no player JavaScript until asked for.
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(screen.getByRole('button', { name: 'Play video: Sabbatical intro' })).toBeTruthy()
  })

  it('mounts the no-cookie player, autoplaying, on click', () => {
    const { container } = render(<YouTubeEmbed id="dQw4w9WgXcQ" />)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))

    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1')
    expect(iframe.getAttribute('title')).toBe('YouTube video')
    expect(iframe.getAttribute('allow')).toContain('autoplay')
    expect(container.querySelector('button')).toBeNull()
  })

  it('uses the portrait frame for Shorts', () => {
    const { container } = render(<YouTubeEmbed id="abcdefghijk" portrait />)
    expect(container.firstElementChild!.className).toBe('notion-youtube notion-youtube-portrait')
  })
})
