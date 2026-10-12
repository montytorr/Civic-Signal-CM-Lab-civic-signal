import { NextResponse } from 'next/server'
import { readSessionToken, sessionCookie } from '@/lib/auth/cookie'
import { normalizeEmail } from '@/lib/auth/crypto'
import { limitLoginAttempt, reservePasswordAttempt } from '@/lib/auth/limits'
import { logIn } from '@/lib/auth/service'
import { HttpError, clientIp, mutation, readJson } from '@/lib/http'

// Limits (lib/auth/limits.ts): 30 attempts per IP; wrong passwords 10 per email+IP and 100 per
// email, reserved before the check and refunded on success, so concurrent guesses cannot overshoot.
export const POST = mutation(async (req) => {
  const ip = clientIp(req)
  limitLoginAttempt(ip)
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password || password.length > 256) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  const release = reservePasswordAttempt(email, ip)

  // Rotation: whatever session this browser had ends, and a new token is issued.
  const result = await logIn({ email, password, previousToken: readSessionToken(req.headers.get('cookie')) })
  if (!result.ok) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  release()

  const res = NextResponse.json({ success: true, data: { handle: result.handle, verified: result.verified } })
  res.cookies.set(sessionCookie(result.token, result.expiresAt))
  return res
})
