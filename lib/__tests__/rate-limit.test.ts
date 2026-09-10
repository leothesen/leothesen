import { describe, expect, it } from 'vitest'

import { createRateLimiter } from '@/lib/rate-limit'

/**
 * A virtual clock, so these assert the actual spacing rather than sleeping for
 * real. `sleepUntil` jumps the clock forward rather than waiting, which makes
 * the timing exact rather than approximate — a tolerance-based test of a rate
 * limiter tends to pass on a fast machine and flake on a loaded one.
 */
function virtualClock() {
  let t = 0
  return {
    now: () => t,
    // Absolute target, so concurrent waiters do not compound each other.
    sleepUntil: async (timestamp: number) => {
      t = Math.max(t, timestamp)
    },
    advance: (ms: number) => {
      t += ms
    },
    get time() {
      return t
    },
  }
}

describe('createRateLimiter', () => {
  it('spaces out call starts by the configured rate', async () => {
    const clock = virtualClock()
    const limit = createRateLimiter(2, { now: clock.now, sleepUntil: clock.sleepUntil })

    const starts: number[] = []
    for (let i = 0; i < 4; i++) {
      await limit(async () => {
        starts.push(clock.now())
      })
    }

    // 2 per second means one every 500ms.
    expect(starts).toEqual([0, 500, 1000, 1500])
  })

  it('bounds the issue rate even when every call returns instantly', async () => {
    // The actual bug: pLimit(3) with instant responses issues far more than
    // three a second, because it limits concurrency and not rate.
    const clock = virtualClock()
    const limit = createRateLimiter(3, { now: clock.now, sleepUntil: clock.sleepUntil })

    for (let i = 0; i < 30; i++) await limit(async () => {})

    // 30 calls at 3/s cannot finish sooner than ~10 seconds of virtual time.
    expect(clock.time).toBeGreaterThanOrEqual(9000)
  })

  it('does not delay a call that arrives after a natural gap', async () => {
    const clock = virtualClock()
    const limit = createRateLimiter(2, { now: clock.now, sleepUntil: clock.sleepUntil })

    await limit(async () => {})
    // Caller went away and did something slow.
    clock.advance(5000)

    const startedAt: number[] = []
    await limit(async () => startedAt.push(clock.now()))

    // No make-up delay: the budget is not banked, but neither is it charged.
    expect(startedAt[0]).toBe(5000)
  })

  it('spaces concurrent callers too, not just sequential ones', async () => {
    // Asserting on the wake times the limiter *asks for*, rather than on the
    // clock each callback observes. Four callers all waiting at once cannot be
    // modelled by advancing a single virtual clock — every sleepUntil runs
    // before any resolves, so the last one wins and all four callbacks read the
    // same instant. Simulating an event loop to fix that would test the
    // simulation. What matters here is the schedule the limiter chose.
    const requested: number[] = []
    let t = 0
    const limit = createRateLimiter(4, {
      now: () => t,
      sleepUntil: async (timestamp) => {
        requested.push(timestamp)
      },
    })

    // Fired together, the way the sync fans out over pages.
    await Promise.all(Array.from({ length: 4 }, () => limit(async () => {})))

    // The first goes straight through; the rest are spaced 250ms apart.
    expect(requested).toEqual([250, 500, 750])
  })

  it('returns what the wrapped function returns, and propagates its errors', async () => {
    const limit = createRateLimiter(1000)
    await expect(limit(async () => 'ok')).resolves.toBe('ok')
    await expect(limit(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('rejects a nonsensical rate rather than dividing by zero', () => {
    expect(() => createRateLimiter(0)).toThrow(/positive/)
    expect(() => createRateLimiter(-1)).toThrow(/positive/)
  })
})
