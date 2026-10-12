import { NextResponse } from 'next/server'
import { clearedSessionCookie } from '@/lib/auth/cookie'
import { validatePassword } from '@/lib/auth/crypto'
import { resetPassword } from '@/lib/auth/service'
import { HttpError, clientIp, mutation, readJson } from '@/lib/http'
import { limitIp } from '@/lib/auth/limits'

// Sets a new password with a reset token. A5: every session of the user ends, this browser's too.
export const POST = mutation(async (req) => {
  limitIp('reset', clientIp(req))
  const body = await readJson(req)
  const token = typeof body.token === 'string' ? body.token : ''
  const passwordError = validatePassword(body.password)
  if (passwordError) throw new HttpError(400, passwordError, 'INVALID_PASSWORD')
  if (!token || !(await resetPassword({ token, password: body.password as string }))) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.', 'INVALID_TOKEN')
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(clearedSessionCookie())
  return res
})
