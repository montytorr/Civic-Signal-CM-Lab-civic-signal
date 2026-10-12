// @vitest-environment node
// The rate limiter's memory is bounded: expired entries are swept, the map is capped (oldest out),
// keys are cut to a fixed length, and failure-only limits count only what they are told to.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ENTRIES,
  MAX_KEY_LENGTH,
  rateLimit,
  rateLimitSize,
  refundAttempt,
  reserveAttempts,
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

  it('failure-only limits: a reserved slot is refunded on success, kept on failure', () => {
    const release = reserveAttempts([['fail', 2, 60_000]])
    release() // success: not counted
    reserveAttempts([['fail', 2, 60_000]]) // failure: kept
    reserveAttempts([['fail', 2, 60_000]]) // failure: kept
    expect(() => reserveAttempts([['fail', 2, 60_000]])).toThrow(/Too many/)
  })

  it('reserving is atomic: N callers before any result cannot exceed the cap', () => {
    // Reservations happen synchronously before the slow check, so 15 concurrent attempts against a
    // cap of 10 get exactly 10 slots.
    let granted = 0
    for (let i = 0; i < 15; i++) {
      try {
        reserveAttempts([['burst', 10, 60_000]])
        granted++
      } catch {
        // refused
      }
    }
    expect(granted).toBe(10)
  })

  it('reserving several keys is all or nothing', () => {
    for (let i = 0; i < 3; i++) reserveAttempts([['b', 3, 60_000]])
    expect(() => reserveAttempts([['a', 5, 60_000], ['b', 3, 60_000]])).toThrow()
    // 'a' was refunded when 'b' refused, so it still has all 5.
    for (let i = 0; i < 5; i++) reserveAttempts([['a', 5, 60_000]])
    expect(() => reserveAttempts([['a', 5, 60_000]])).toThrow()
    refundAttempt('a')
    expect(() => reserveAttempts([['a', 5, 60_000]])).not.toThrow()
  })
})
