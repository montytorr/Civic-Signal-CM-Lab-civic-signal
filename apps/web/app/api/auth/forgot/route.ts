import { NextResponse } from 'next/server'
import { normalizeEmail } from '@/lib/auth/crypto'
import { requestPasswordReset } from '@/lib/auth/service'
import { HttpError, baseUrlFor, clientIp, mutation, readJson } from '@/lib/http'
import { limitEmailFlow, limitIp } from '@/lib/auth/limits'

// Emails a password reset link. Always answers success, so it does not reveal who has an account.
export const POST = mutation(async (req) => {
  const ip = clientIp(req)
  limitIp('reset', ip)
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  if (!email) throw new HttpError(400, 'Valid email is required', 'INVALID_EMAIL')
  limitEmailFlow('reset', email, ip)

  await requestPasswordReset({ email, baseUrl: baseUrlFor(req) })
  return NextResponse.json({ success: true })
})
