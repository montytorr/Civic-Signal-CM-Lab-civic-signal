import { NextResponse } from 'next/server'
import { clearedSessionCookie, readSessionToken } from '@/lib/auth/cookie'
import { deleteSessionToken } from '@/lib/auth/session'
import { mutation } from '@/lib/http'

export const POST = mutation(async (req) => {
  await deleteSessionToken(readSessionToken(req.headers.get('cookie')))
  const res = NextResponse.json({ success: true })
  res.cookies.set(clearedSessionCookie())
  return res
})
