// @vitest-environment node
// The rate limiter's memory is bounded: expired entries are swept, the map is capped (oldest out),
// keys are cut to a fixed length, and failure-only limits count only what they are told to.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ENTRIES,
  MAX_KEY_LENGTH,
  isRateLimited,
  rateLimit,
  rateLimitSize,
  recordAttempt,
  resetRateLimits,
} from '@/lib/rate-limit'

beforeEach(() => resetRateLimits())
afterEach(() => vi.restoreAllMocks())

describe('rate limiter bounds', () => {
  it('evicts the oldest key past MAX_ENTRIES', () => {
    for (let i = 0; i < 3; i++) rateLimit('first', 3, 60_000)
    expect(rateLimit('first', 3, 60_000).allowed).toBe(false)
    for (let i = 0; i < MAX_ENTRIES; i++) rateLimit(`filler-${i}`, 3, 60_000)
    expect(rateLimitSize()).toBe(MAX_ENTRIES)
    // 'first' was the oldest and is gone, so it starts over.
    expect(rateLimit('first', 3, 60_000).allowed).toBe(true)
    expect(rateLimitSize()).toBe(MAX_ENTRIES)
  })

  it('sweeps expired entries', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    for (let i = 0; i < 100; i++) rateLimit(`short-${i}`, 3, 1_000)
    rateLimit('long', 3, 10 * 60_000)
    expect(rateLimitSize()).toBe(101)
    vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60_000)
    rateLimit('trigger', 3, 1_000)
    expect(rateLimitSize()).toBe(2) // 'long' and 'trigger'
  })

  it('cuts keys to MAX_KEY_LENGTH', () => {
    const base = 'k'.repeat(MAX_KEY_LENGTH)
    for (let i = 0; i < 3; i++) rateLimit(`${base}-${i}`, 3, 60_000)
    // All three share the cut key, so the fourth is refused.
    expect(rateLimit(`${base}-other`, 3, 60_000).allowed).toBe(false)
    expect(rateLimitSize()).toBe(1)
  })

  it('failure-only limits: checking does not count, recording does', () => {
    expect(isRateLimited('fail', 2)).toBe(false)
    expect(isRateLimited('fail', 2)).toBe(false)
    recordAttempt('fail', 60_000)
    expect(isRateLimited('fail', 2)).toBe(false)
    recordAttempt('fail', 60_000)
    expect(isRateLimited('fail', 2)).toBe(true)
  })
})
