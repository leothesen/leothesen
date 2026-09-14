/**
 * The extension a copied Notion file is stored under.
 *
 * It matters more than it looks: Vercel Blob sets Content-Type from the
 * pathname's extension, and the site sends `X-Content-Type-Options: nosniff`.
 * This used to allow image extensions only and call everything else `.jpg`,
 * which was fine while the sync copied only images. Once it copied every Notion
 * file (#135), a GarageBand MP3 and 19 phone videos went up as `.jpg` and were
 * served as `image/jpeg` — which a browser is entitled to refuse to play.
 */

const IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']
const AUDIO = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac']
const VIDEO = ['.mp4', '.m4v', '.mov', '.webm', '.ogv']
const DOCUMENT = ['.pdf']

const KNOWN = new Set([...IMAGE, ...AUDIO, ...VIDEO, ...DOCUMENT])

/**
 * The file's own extension when it is one we know how to serve, else `.jpg`.
 *
 * The `.jpg` fallback is kept for what it was written for: Notion image URLs
 * that carry no extension at all. An image's stored name never changes here,
 * so no image is re-uploaded because of this function.
 */
export function fileExtFromUrl(url: string): string {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(url).pathname)
  } catch {
    pathname = url.split(/[?#]/)[0]
  }
  const match = pathname.toLowerCase().match(/\.[a-z0-9]+$/)
  const ext = match?.[0]
  return ext && KNOWN.has(ext) ? ext : '.jpg'
}

/**
 * Whether a previously copied file's URL was stored under the name it should
 * have. A copy made before an extension was recognised has to be uploaded
 * again under the right name — reusing it would keep the wrong Content-Type.
 */
export function isStoredUnder(servedUrl: string, filename: string): boolean {
  const pathname = servedUrl.split(/[?#]/)[0]
  return pathname.endsWith(`/${filename}`)
}
