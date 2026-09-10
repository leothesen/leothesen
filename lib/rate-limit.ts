/**
 * A rate limiter, as distinct from a concurrency limiter.
 *
 * `pLimit(n)` caps how many calls are in flight at once, which is not the same
 * thing as calls per second and is not what Notion measures. With `pLimit(3)`
 * and 100ms responses you issue roughly 30 requests a second against a limit of
 * about three — so the sync ran permanently over budget and spent half its time
 * absorbing 429s. Measured on run 34460188970: 152 seconds of backoff inside a
 * 313 second sync.
 *
 * This spaces out the *starts* instead. Calls queue behind a moving cursor, so
 * the issue rate is bounded no matter how fast responses come back or how many
 * callers pile in.
 *
 * Concurrency still needs its own limit for slow responses, so this composes
 * with pLimit rather than replacing it.
 */

export interface RateLimiterOptions {
  /** Injected for tests, so they need neither real time nor fake timers. */
  now?: () => number
  /**
   * Waits until an absolute timestamp — deliberately not a duration.
   *
   * Several callers can be waiting at once, each having reserved a different
   * slot. A duration-based seam cannot express that against a virtual clock:
   * the waits are all computed from the same instant, so advancing the clock by
   * each duration in turn compounds them and every caller after the first
   * appears late. An absolute target is what each caller actually means.
   */
  sleepUntil?: (timestamp: number) => Promise<void>
}

export type Scheduler = <T>(fn: () => Promise<T>) => Promise<T>

export function createRateLimiter(
  requestsPerSecond: number,
  { now = Date.now, sleepUntil = defaultSleepUntil }: RateLimiterOptions = {}
): Scheduler {
  if (!(requestsPerSecond > 0)) {
    throw new Error(`requestsPerSecond must be positive, got ${requestsPerSecond}`)
  }

  const minGapMs = 1000 / requestsPerSecond
  // The earliest moment the next call may start. Reserved synchronously, so
  // callers racing to schedule still come out evenly spaced.
  let nextSlot = 0

  return async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const t = now()
    const startAt = Math.max(t, nextSlot)
    nextSlot = startAt + minGapMs

    if (startAt > t) await sleepUntil(startAt)
    return fn()
  }
}

function defaultSleepUntil(timestamp: number): Promise<void> {
  const ms = timestamp - Date.now()
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
