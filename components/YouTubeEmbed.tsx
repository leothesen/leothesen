import * as React from 'react'

/**
 * A YouTube embed that costs nothing until someone wants to watch.
 *
 * The plain iframe pulls YouTube's player eagerly: measured on
 * /novel-experiences/sabbatical/introduction, one video accounted for ~950KB
 * of the page's 977KB of JavaScript. `loading="lazy"` does not help once the
 * embed scrolls into view, which on these pages it always does.
 *
 * So the frame starts as a poster and a play button, and the real player is
 * only mounted on click — at which point it autoplays, because the click was
 * the request to watch. Sixteen pages carry one of these.
 */
export function YouTubeEmbed({
  id,
  title,
  portrait,
}: {
  id: string
  title?: string
  /** Shorts are filmed 9:16 and letterbox badly in the default 16:9 frame. */
  portrait?: boolean
}) {
  const [active, setActive] = React.useState(false)
  const label = title ? `Play video: ${title}` : 'Play video'

  return (
    <div className={`notion-youtube${portrait ? ' notion-youtube-portrait' : ''}`}>
      {active ? (
        <iframe
          // nocookie is the same player without the tracking cookies, and
          // costs nothing to prefer.
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title || 'YouTube video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className="notion-youtube-poster" onClick={() => setActive(true)} aria-label={label}>
          {/* hqdefault rather than maxresdefault: it exists for every video,
              where the larger one 404s for older uploads. */}
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span className="notion-youtube-play" aria-hidden>
            <svg viewBox="0 0 68 48" width="68" height="48">
              <path
                d="M66.52 7.74a8.6 8.6 0 0 0-6-6.1C55.79.5 34 .5 34 .5s-21.79 0-26.52 1.14a8.6 8.6 0 0 0-6 6.1A90 90 0 0 0 .5 24a90 90 0 0 0 1 16.26 8.6 8.6 0 0 0 6 6.1C12.21 47.5 34 47.5 34 47.5s21.79 0 26.52-1.14a8.6 8.6 0 0 0 6-6.1A90 90 0 0 0 67.5 24a90 90 0 0 0-.98-16.26Z"
                fill="#f00"
              />
              <path d="M27 34V14l18 10-18 10Z" fill="#fff" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
