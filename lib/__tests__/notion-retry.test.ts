import { describe, expect, it } from 'vitest'

import { isRateLimited, retryDelaySeconds } from '@/lib/notion-retry'

/**
 * These exist because the previous implementation read
 * `err.headers['retry-after']` and silently got `undefined` every time — the
 * Notion SDK hands over a WHATWG `Headers` object, where bracket access reaches
 * nothing. The sync then backed off on a fallback while Notion asked for
 * longer, exhausted its attempts, and failed the run.
 *
 * The first test below is the one that would have caught it.
 */

describe('isRateLimited', () => {
  it('recognises a Notion 429', () => {
    expect(isRateLimited({ status: 429 })).toBe(true)
    expect(isRateLimited({ code: 'rate_limited' })).toBe(true)
  })

  it('does not treat other failures as rate limits', () => {
    expect(isRateLimited({ status: 404, code: 'object_not_found' })).toBe(false)
    expect(isRateLimited({ code: 'validation_error' })).toBe(false)
    expect(isRateLimited(new Error('socket hang up'))).toBe(false)
    expect(isRateLimited(undefined)).toBe(false)
  })
})

describe('retryDelaySeconds', () => {
  it('reads retry-after from a Headers object, not just a plain one', () => {
    // The regression. Bracket access on Headers returns undefined, so the old
    // code fell through to its fallback on every single retry.
    const err = { status: 429, headers: new Headers({ 'retry-after': '2' }) }
    expect(retryDelaySeconds(err, 0)).toBe(2)
    // Still 2 on later attempts: what Notion asked for does not grow.
    expect(retryDelaySeconds(err, 3)).toBe(2)
  })

  it('reads retry-after from a plain headers object too', () => {
    // Older SDK versions hand over a plain object; both shapes must work.
    expect(retryDelaySeconds({ status: 429, headers: { 'retry-after': '7' } }, 0)).toBe(7)
  })

  it('coerces the string header to a number', () => {
    // '2' * 1000 is fine in JS but Number('2s') is NaN, and a NaN delay makes
    // setTimeout fire immediately — a retry storm rather than a backoff.
    const delay = retryDelaySeconds({ status: 429, headers: { 'retry-after': '2' } }, 0)
    expect(typeof delay).toBe('number')
    expect(Number.isFinite(delay)).toBe(true)
  })

  it('falls back to additional_data.retry_after in the body', () => {
    // The exact shape from the failing run on 2026-09-10.
    const body = JSON.stringify({
      object: 'error',
      status: 429,
      code: 'rate_limited',
      message: 'You have been rate limited. Please try again later.',
      additional_data: { rate_limit_reason: 'public_api_request_rate_limit', retry_after: '2' },
    })
    expect(retryDelaySeconds({ status: 429, body }, 0)).toBe(2)
    expect(retryDelaySeconds({ status: 429, body: JSON.parse(body) }, 0)).toBe(2)
  })

  it('backs off exponentially when the response says nothing', () => {
    const bare = { status: 429 }
    expect(retryDelaySeconds(bare, 0)).toBe(1)
    expect(retryDelaySeconds(bare, 1)).toBe(2)
    expect(retryDelaySeconds(bare, 2)).toBe(4)
    expect(retryDelaySeconds(bare, 3)).toBe(8)
  })

  it('caps the wait so a long stall cannot park CI for minutes', () => {
    expect(retryDelaySeconds({ status: 429 }, 20)).toBe(30)
    expect(retryDelaySeconds({ status: 429, headers: { 'retry-after': '600' } }, 0)).toBe(30)
  })

  it('ignores unusable header values rather than waiting NaN or zero', () => {
    // A NaN or 0 delay is worse than no header at all: setTimeout fires at once.
    for (const value of ['', 'soon', '0', '-5']) {
      const delay = retryDelaySeconds({ status: 429, headers: { 'retry-after': value } }, 2)
      expect(delay).toBe(4)
    }
  })

  it('survives a malformed body', () => {
    expect(retryDelaySeconds({ status: 429, body: 'not json' }, 1)).toBe(2)
    expect(retryDelaySeconds({ status: 429, body: null }, 1)).toBe(2)
  })
})
