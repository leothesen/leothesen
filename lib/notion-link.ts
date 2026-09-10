/**
 * Pulling a Notion page id out of whatever shape a link happens to take.
 *
 * Notion emits several, and which one you get depends on how the link was
 * made rather than on anything meaningful:
 *
 *   /p/<id>?pvs=25                        what the app writes for an internal
 *                                         link — RELATIVE, no host at all
 *   https://www.notion.so/<id>
 *   https://www.notion.so/Some-Title-<id>
 *   https://www.notion.so/workspace/Title-<id>
 *   https://app.notion.com/p/<id>         the newer domain
 *   ...any of the above with a dashed uuid
 *
 * The relative form is the one that matters most and was the one previously
 * unhandled. It is also the most dangerous to miss: a href beginning with `/`
 * is treated as internal by the renderer, so an unrewritten `/p/<id>` becomes
 * a same-site link to a path that does not exist. Measured on the live build,
 * /p/330ca8d550aa4141983499f780a55cb6 returns 404 — so converting a link in
 * Notion made it worse than the hardcoded absolute URL it replaced.
 */

/** A Notion id is 32 hex characters, optionally split by dashes into a uuid. */
const ID = '[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}'

const PATTERNS = [
  // Relative internal link, e.g. /p/<id>?pvs=25
  new RegExp(`^/p/(${ID})`),
  // Bare relative id, which some older exports produce
  new RegExp(`^/(${ID})(?:[?#]|$)`),
  // Any notion host, with or without a title slug or workspace segment
  new RegExp(`(?:notion\\.so|notion\\.site|app\\.notion\\.com)/(?:[^/?#]+/)*?(?:[^/?#]*?-)?(${ID})`),
]

/**
 * The 32-character page id in a link, or null when there isn't one.
 *
 * Dashes are stripped, because the manifest is keyed without them.
 */
export function notionPageIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null

  for (const pattern of PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1].replace(/-/g, '').toLowerCase()
  }
  return null
}
