import * as React from 'react'

// Cal.com's booker lays out as two columns (event details beside the month
// calendar) above roughly 800px, and stacks into a tall, left-hugging single
// column below it. Measured against cal.com/leo-thesen/15min: at 688px — the
// width of the article column — it needs 1031px of height; at 800px and up it
// needs about 538px. So the booker has to break out of the article column to
// render the way it is meant to.
const FALLBACK_HEIGHT = 560

function buildEmbedSrc(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    // `embed` switches Cal to its embed chrome and, importantly, makes it
    // broadcast __dimensionChanged so we can size the frame to its content.
    url.searchParams.set('embed', '')
    if (!url.searchParams.has('layout')) {
      url.searchParams.set('layout', 'month_view')
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Cal.com booking embed that sizes itself to its content.
 *
 * A plain iframe cannot do this: the booker is taller than any fixed height we
 * could pick, so it ends up scrolling inside its own frame. Cal posts its
 * rendered height to the parent, so we listen for that and follow it, which
 * keeps the whole booker visible without a scrollbar.
 */
export function CalEmbed({ url }: { url: string }) {
  const src = React.useMemo(() => buildEmbedSrc(url), [url])
  const [height, setHeight] = React.useState(FALLBACK_HEIGHT)
  const frameRef = React.useRef<HTMLIFrameElement>(null)

  React.useEffect(() => {
    if (!src) return
    const expectedOrigin = new URL(src).origin

    function onMessage(event: MessageEvent) {
      // Only trust the frame we actually rendered.
      if (event.origin !== expectedOrigin) return
      if (event.source !== frameRef.current?.contentWindow) return

      let payload: any = event.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          return
        }
      }
      if (payload?.originator !== 'CAL') return
      if (payload?.type !== '__dimensionChanged') return

      const next = Number(payload?.data?.iframeHeight)
      if (Number.isFinite(next) && next > 0) {
        setHeight(Math.ceil(next))
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [src])

  // An unparseable URL is not worth breaking the page over — fall back to the
  // plain link so the booking is still reachable.
  if (!src) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    )
  }

  return (
    <div className="notion-cal-embed">
      <iframe
        ref={frameRef}
        src={src}
        title="Book a meeting"
        style={{ height: `${height}px` }}
        loading="lazy"
      />
    </div>
  )
}
