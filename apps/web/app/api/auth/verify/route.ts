import { NextResponse } from 'next/server'
import { sessionCookie } from '@/lib/auth/cookie'
import { limitIp, reservePasswordAttempt } from '@/lib/auth/limits'
import { verifyEmail, verifyTokenEmail } from '@/lib/auth/service'
import { HttpError, clientIp, mutation, readJson } from '@/lib/http'

const INVALID = 'This confirmation link is invalid or has expired. Sign up again to get a new one.'

// Confirms an email: the token from the link plus the account's current password (see
// lib/auth/service.ts). The token is single-use and expires (A5). A wrong password counts against the
// same password-failure limits as login (reserved before the check, refunded unless the password
// was wrong), and spends the token after 5. On success every earlier session of the account ends
// and this browser gets a new one.
export const POST = mutation(async (req) => {
  const ip = clientIp(req)
  limitIp('verify', ip, 20)
  const body = await readJson(req)
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!token) throw new HttpError(400, INVALID, 'INVALID_TOKEN')
  if (!password || password.length > 256) throw new HttpError(400, 'Enter your password to confirm.', 'WRONG_PASSWORD')

  const email = await verifyTokenEmail(token)
  if (!email) throw new HttpError(400, INVALID, 'INVALID_TOKEN')
  const release = reservePasswordAttempt(email, ip)

  const result = await verifyEmail({ token, password })
  if (!result.ok) {
    if (result.reason === 'invalid_token') {
      release()
      throw new HttpError(400, INVALID, 'INVALID_TOKEN')
    }
    if (result.reason === 'token_spent') {
      throw new HttpError(400, 'Too many wrong passwords: this confirmation link no longer works. Sign up again to get a new one.', 'TOKEN_SPENT')
    }
    throw new HttpError(400, 'That is not the password of this account. If you signed up more than once, use the password from your latest signup.', 'WRONG_PASSWORD')
  }
  release()

  const res = NextResponse.json({ success: true })
  res.cookies.set(sessionCookie(result.token, result.expiresAt))
  return res
})
