/**
 * Every Notion-hosted file URL carried by a single block.
 *
 * Notion serves its own uploads from a signed S3 URL that expires one hour
 * after it is handed to you:
 *
 *   "icon": {
 *     "type": "file",
 *     "file": {
 *       "url": "https://prod-files-secure.s3…",
 *       "expiry_time": "2026-09-11T11:14:21.583Z"
 *     }
 *   }
 *
 * The sync copies those to Blob storage and rewrites the URL, so anything it
 * fails to collect stays pointed at a link that dies within the hour.
 *
 * The version this replaces looked only at `block.image` and `block.video`.
 * Every other place Notion puts a file was therefore never copied — most
 * visibly the six company logos on /get-in-touch/cv, which are **callout
 * icons**. They were live for one hour after each sync and broken for the
 * other twenty-three, and no repair could fix them, because the repair
 * collects through here too. Measured on the live site: 200 at 10:16, with an
 * `expiry_time` of 11:14 the same morning.
 *
 * So this matches on the *shape* of a Notion file object rather than on a list
 * of block types. A list is precisely what failed, and Notion keeps adding
 * block types — file, pdf, audio, and a page icon on a child_page all carry
 * the same structure.
 */

/** A Notion file object: `{ url, expiry_time? }` under a `file` key. */
function isFileObject(value: unknown): value is { url: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { url?: unknown }).url === 'string'
  )
}

/**
 * The Notion-hosted file URLs in this block's own data.
 *
 * `children` is skipped: the caller walks the tree one block at a time, and
 * descending here would collect a child's files against its parent.
 *
 * External URLs are deliberately not returned. They belong to somebody else's
 * server, they do not expire, and so they are not what rots.
 */
export function notionFileUrls(block: unknown): string[] {
  const found: string[] = []

  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'children') continue

      // The one shape that matters. Not `external`, whose url is a link to
      // someone else's host, and not `href` or `link.url` in rich text, which
      // are hyperlinks rather than files — downloading those would pull whole
      // web pages into Blob storage.
      if (key === 'file' && isFileObject(child)) {
        found.push(child.url)
        continue
      }

      walk(child)
    }
  }

  walk(block)
  return found
}
