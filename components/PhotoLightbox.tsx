import * as React from 'react'
import Image from 'next/image'

/**
 * Click a photograph to see it properly.
 *
 * The originals are 4,032px wide and the article shows them at around 900. On a
 * site whose content is 1,038 photographs, the rest of the picture was simply
 * not reachable — this is the one place the full image is handed over.
 *
 * Clicks are taken by delegation on the article container rather than by
 * wiring a handler into every image block: the renderer stays a pure function
 * of the blocks, and this works for images nested in columns and callouts
 * without threading a context through all of them. The renderer's only part in
 * it is marking each photograph with data-photo, which is also what makes an
 * image keyboard-reachable — it is a real <button>, not a div with a handler.
 */

interface Photo {
  src: string
  alt: string
}

function readPhotos(root: HTMLElement): Photo[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-photo]')).map((el) => ({
    src: el.dataset.photo || '',
    alt: el.dataset.photoAlt || '',
  }))
}

export function PhotoLightbox({
  className,
  children,
}: {
  /**
   * Applied to the delegating container itself rather than to a div nested
   * inside it. The stylesheet addresses blocks as direct children of
   * `.notion-page-body`, so an extra wrapper here would quietly break the
   * breakout width of every photograph on the site.
   */
  className?: string
  children: React.ReactNode
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const openerRef = React.useRef<HTMLElement | null>(null)
  const [photos, setPhotos] = React.useState<Photo[]>([])
  const [index, setIndex] = React.useState<number | null>(null)

  const close = React.useCallback(() => {
    setIndex(null)
    // Back to the photograph that was clicked, so a keyboard user does not land
    // at the top of the document every time they close one.
    openerRef.current?.focus()
    openerRef.current = null
  }, [])

  const onContainerClick = React.useCallback((event: React.MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>('[data-photo]')
    if (!target || !containerRef.current) return

    const all = readPhotos(containerRef.current)
    const position = all.findIndex((photo) => photo.src === target.dataset.photo)
    if (position === -1) return

    openerRef.current = target
    setPhotos(all)
    setIndex(position)
  }, [])

  const isOpen = index !== null

  React.useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((current) => (current === null ? null : (current + 1) % photos.length))
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((current) =>
          current === null ? null : (current - 1 + photos.length) % photos.length
        )
      }
    }

    document.addEventListener('keydown', onKeyDown)

    // The page behind must not scroll under the overlay. Padding replaces the
    // scrollbar's width so the layout does not jump sideways as it disappears.
    const { body, documentElement } = document
    const scrollbar = window.innerWidth - documentElement.clientWidth
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
    }
  }, [isOpen, photos.length, close])

  const current = index === null ? null : photos[index]

  return (
    <>
      <div ref={containerRef} className={className} onClick={onContainerClick}>
        {children}
      </div>

      {current && (
        <div
          className="notion-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={current.alt || 'Photograph'}
          onClick={close}
        >
          <button
            type="button"
            className="notion-lightbox-close"
            onClick={close}
            aria-label="Close"
            autoFocus
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="notion-lightbox-stage">
            <Image
              // Keyed on the source so React replaces the element rather than
              // swapping src on one that is already decoded — without it the
              // previous photograph stays on screen until the next decodes.
              key={current.src}
              src={current.src}
              alt={current.alt}
              fill
              sizes="100vw"
              priority
              className="notion-lightbox-image"
            />
          </div>

          {(current.alt || photos.length > 1) && (
            <div className="notion-lightbox-bar">
              {current.alt && <span className="notion-lightbox-caption">{current.alt}</span>}
              {photos.length > 1 && (
                <span className="notion-lightbox-count">
                  {(index as number) + 1} / {photos.length}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
