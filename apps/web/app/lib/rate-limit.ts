import { HttpError } from '@/lib/http'

// In-memory, per process. Bounded: expired entries are swept, the map holds at most MAX_ENTRIES
// (the oldest go first) and keys are cut to MAX_KEY_LENGTH, so request data cannot grow it.
export const MAX_ENTRIES = 10_000
export const MAX_KEY_LENGTH = 200
const SWEEP_INTERVAL_MS = 60_000

const attempts = new Map<string, { count: number; resetAt: number }>()
let lastSweep = 0

const sweep = (now: number) => {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, entry] of attempts) if (now > entry.resetAt) attempts.delete(key)
}

const boundedKey = (key: string) => key.slice(0, MAX_KEY_LENGTH)

// Insert or replace an entry as the newest, evicting the oldest past the cap.
const store = (key: string, entry: { count: number; resetAt: number }) => {
  attempts.delete(key)
  attempts.set(key, entry)
  while (attempts.size > MAX_ENTRIES) {
    const oldest = attempts.keys().next().value
    if (oldest === undefined) break
    attempts.delete(oldest)
  }
}

export const rateLimit = (
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number } => {
  const now = Date.now()
  sweep(now)
  const k = boundedKey(key)
  const entry = attempts.get(k)

  if (!entry || now > entry.resetAt) {
    store(k, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: maxAttempts - entry.count }
}

/**
 * Give back one attempt (the request turned out not to be a failure). With rateLimit, this is how
 * a failure-only limit stays atomic: take a slot before the slow check (so concurrent requests
 * cannot all pass a check that only one of them should), and refund it when the check succeeds.
 */
export const refundAttempt = (key: string) => {
  const entry = attempts.get(boundedKey(key))
  if (entry && entry.count > 0) entry.count--
}

/**
 * Take one slot on each key, all or nothing; throws 429 (taking none) if any key is spent.
 * Returns a function that refunds them all.
 */
export const reserveAttempts = (limits: Array<[key: string, max: number, windowMs: number]>, message = 'Too many attempts. Try again later.') => {
  const taken: string[] = []
  for (const [key, max, windowMs] of limits) {
    if (!rateLimit(key, max, windowMs).allowed) {
      taken.forEach(refundAttempt)
      throw tooMany(windowMs, message)
    }
    taken.push(key)
  }
  return () => taken.forEach(refundAttempt)
}

/** The window for the auth limits (login, signup, resend, reset): 15 minutes. */
export const AUTH_WINDOW_MS = 15 * 60 * 1000

const tooMany = (windowMs: number, message: string) =>
  new HttpError(429, message, 'RATE_LIMITED', { 'Retry-After': String(Math.ceil(windowMs / 1000)) })

/** Count an attempt against a key; past the limit, throw a 429 for the route to return. */
export const enforceRateLimit = (key: string, maxAttempts: number, windowMs: number, message = 'Too many attempts. Try again later.') => {
  if (!rateLimit(key, maxAttempts, windowMs).allowed) throw tooMany(windowMs, message)
}


/** Forget every counter (tests). */
export const resetRateLimits = () => {
  attempts.clear()
  lastSweep = 0
}

/** How many keys are held (tests). */
export const rateLimitSize = () => attempts.size
