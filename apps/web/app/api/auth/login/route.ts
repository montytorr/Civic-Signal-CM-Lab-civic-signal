import { NextResponse } from 'next/server'
import { readSessionToken, sessionCookie } from '@/lib/auth/cookie'
import { normalizeEmail } from '@/lib/auth/crypto'
import { logIn } from '@/lib/auth/service'
import { HttpError, clientIp, mutation, readJson } from '@/lib/http'
import { AUTH_WINDOW_MS, enforceNotLimited, enforceRateLimit, recordAttempt } from '@/lib/rate-limit'

const TOO_MANY = 'Too many authentication attempts. Try again later.'

// Limits, per 15 minutes: 30 attempts per IP (password spraying across accounts), 10 failures per
// email and IP (guessing one account), and 50 failures per email from anywhere. Failures, not
// attempts, count against an email, and the per-email cap is high, so someone who knows your email
// cannot lock you out from your own IP.
export const POST = mutation(async (req) => {
  const ip = clientIp(req)
  enforceRateLimit(`login:${ip}`, 30, AUTH_WINDOW_MS, TOO_MANY)
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password || password.length > 256) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  const pairKey = `login-fail:${email}:${ip}`
  const emailKey = `login-fail:${email}`
  enforceNotLimited(pairKey, 10, AUTH_WINDOW_MS, TOO_MANY)
  enforceNotLimited(emailKey, 50, AUTH_WINDOW_MS, TOO_MANY)

  // Rotation: whatever session this browser had ends, and a new token is issued.
  const result = await logIn({ email, password, previousToken: readSessionToken(req.headers.get('cookie')) })
  if (!result.ok) {
    recordAttempt(pairKey, AUTH_WINDOW_MS)
    recordAttempt(emailKey, AUTH_WINDOW_MS)
    throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const res = NextResponse.json({ success: true, data: { handle: result.handle, verified: result.verified } })
  res.cookies.set(sessionCookie(result.token, result.expiresAt))
  return res
})
