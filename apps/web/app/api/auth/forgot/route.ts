import { NextResponse } from 'next/server'
import { normalizeEmail } from '@/lib/auth/crypto'
import { requestPasswordReset } from '@/lib/auth/service'
import { HttpError, baseUrlFor, clientIp, mutation, readJson } from '@/lib/http'
import { AUTH_WINDOW_MS, enforceRateLimit } from '@/lib/rate-limit'

// Emails a password reset link. Always answers success, so it does not reveal who has an account.
export const POST = mutation(async (req) => {
  enforceRateLimit(`reset:${clientIp(req)}`, 10, AUTH_WINDOW_MS)
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  if (!email) throw new HttpError(400, 'Valid email is required', 'INVALID_EMAIL')
  enforceRateLimit(`reset:${email}`, 5, AUTH_WINDOW_MS)

  await requestPasswordReset({ email, baseUrl: baseUrlFor(req) })
  return NextResponse.json({ success: true })
})
