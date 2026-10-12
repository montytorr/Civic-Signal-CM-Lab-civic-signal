import { NextResponse } from 'next/server'
import { normalizeEmail, validatePassword } from '@/lib/auth/crypto'
import { signUp } from '@/lib/auth/service'
import { HttpError, baseUrlFor, clientIp, mutation, readJson } from '@/lib/http'
import { AUTH_WINDOW_MS, enforceRateLimit } from '@/lib/rate-limit'

// Creates the account and emails a verification link. It does not sign in, and it answers the
// same way for a taken email, so it does not reveal who has an account.
export const POST = mutation(async (req) => {
  enforceRateLimit(`signup:${clientIp(req)}`, 10, AUTH_WINDOW_MS)
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  if (!email) throw new HttpError(400, 'Valid email is required', 'INVALID_EMAIL')
  // Per email too, before any hashing: bounds the verification emails one address can be sent.
  enforceRateLimit(`signup:${email}`, 5, AUTH_WINDOW_MS)
  const passwordError = validatePassword(body.password)
  if (passwordError) throw new HttpError(400, passwordError, 'INVALID_PASSWORD')

  await signUp({ email, password: body.password as string, baseUrl: baseUrlFor(req) })
  return NextResponse.json({ success: true })
})
