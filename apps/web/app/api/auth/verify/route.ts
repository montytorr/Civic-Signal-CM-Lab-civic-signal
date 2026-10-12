import { NextResponse } from 'next/server'
import { sessionCookie } from '@/lib/auth/cookie'
import { verifyEmail } from '@/lib/auth/service'
import { HttpError, clientIp, mutation, readJson } from '@/lib/http'
import { AUTH_WINDOW_MS, enforceRateLimit } from '@/lib/rate-limit'

// Confirms an email: the token from the link plus the account's current password (see
// lib/auth/service.ts). The token is single-use and expires (A5). On success every earlier session
// of the account ends and this browser gets a new one.
export const POST = mutation(async (req) => {
  enforceRateLimit(`verify:${clientIp(req)}`, 20, AUTH_WINDOW_MS)
  const body = await readJson(req)
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!token) throw new HttpError(400, 'This confirmation link is invalid or has expired.', 'INVALID_TOKEN')
  if (!password || password.length > 256) throw new HttpError(400, 'Enter your password to confirm.', 'WRONG_PASSWORD')

  const result = await verifyEmail({ token, password })
  if (!result.ok) {
    throw result.reason === 'wrong_password'
      ? new HttpError(400, 'That is not the password of this account. If you signed up more than once, use the password from your latest signup.', 'WRONG_PASSWORD')
      : new HttpError(400, 'This confirmation link is invalid or has expired. Sign up again to get a new one.', 'INVALID_TOKEN')
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(sessionCookie(result.token, result.expiresAt))
  return res
})
