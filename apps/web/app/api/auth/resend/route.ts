import { NextResponse } from 'next/server'
import { normalizeEmail } from '@/lib/auth/crypto'
import { resendVerification } from '@/lib/auth/service'
import { getRequestViewer } from '@/lib/auth/session'
import { HttpError, baseUrlFor, clientIp, mutation, readJson } from '@/lib/http'
import { AUTH_WINDOW_MS, enforceRateLimit } from '@/lib/rate-limit'

// Re-sends the verification link: to the signed-in user's email, or to the email in the body.
// Always answers success, so it does not reveal who has an account.
export const POST = mutation(async (req) => {
  enforceRateLimit(`resend:${clientIp(req)}`, 10, AUTH_WINDOW_MS)
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>)
  const email = normalizeEmail(body.email) ?? (await getRequestViewer(req))?.email ?? null
  if (!email) throw new HttpError(400, 'Valid email is required', 'INVALID_EMAIL')
  enforceRateLimit(`resend:${email}`, 5, AUTH_WINDOW_MS)

  await resendVerification({ email, baseUrl: baseUrlFor(req) })
  return NextResponse.json({ success: true })
})
