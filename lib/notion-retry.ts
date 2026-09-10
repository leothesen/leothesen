/**
 * How long to wait after Notion returns 429.
 *
 * Split out of scripts/sync-notion.ts so it can be tested: that script calls
 * process.exit(1) at import time when NOTION_TOKEN is unset, so nothing inside
 * it is reachable from a test.
 *
 * The bug this exists to prevent: the previous implementation read
 * `err.headers['retry-after']`. Notion's SDK gives a WHATWG `Headers` object,
 * where bracket access is always `undefined` — the values live behind
 * `Symbol(map)` and only `.get()` reaches them. So the fallback fired on every
 * retry and the sync backed off 1s, 2s, 3s while Notion was asking for longer.
 * It then exhausted its attempts and failed the whole run.
 */

/** Notion reports its rate limit as HTTP 429 and code `rate_limited`. */
export function isRateLimited(err: any): boolean {
  return err?.status === 429 || err?.code === 'rate_limited'
}

/**
 * Seconds to wait before the next attempt, preferring what Notion asked for.
 *
 * Three sources, in order of authority:
 *   1. the `retry-after` response header
 *   2. `additional_data.retry_after` in the JSON body, which Notion also sends
 *   3. exponential backoff, when the response says nothing
 *
 * `attempt` is zero-based, so the backoff runs 1, 2, 4, 8… capped at `maxDelay`
 * to keep a long stall from parking a CI job for minutes.
 */
export function retryDelaySeconds(err: any, attempt: number, maxDelay = 30): number {
  const fromHeader = readHeader(err?.headers, 'retry-after')
  const fromBody = err?.body ? readBodyRetryAfter(err.body) : undefined

  const asked = toPositiveNumber(fromHeader) ?? toPositiveNumber(fromBody)
  if (asked !== undefined) return Math.min(asked, maxDelay)

  return Math.min(2 ** attempt, maxDelay)
}

/**
 * Reads one header from whatever shape the SDK hands over.
 *
 * A `Headers` instance needs `.get()`; a plain object needs bracket access.
 * Older and newer versions of @notionhq/client have produced both, so this
 * accepts either rather than betting on one.
 */
function readHeader(headers: any, name: string): unknown {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name)
  return headers[name] ?? headers[name.toLowerCase()]
}

/** Notion repeats the value in the error body as `additional_data.retry_after`. */
function readBodyRetryAfter(body: unknown): unknown {
  if (typeof body === 'object' && body !== null) {
    return (body as any)?.additional_data?.retry_after
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)?.additional_data?.retry_after
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Header values are strings, so a bare `value * 1000` would yield NaN. */
function toPositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
