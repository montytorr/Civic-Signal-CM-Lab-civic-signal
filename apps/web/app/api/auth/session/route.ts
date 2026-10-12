import { NextResponse } from 'next/server'
import { getRequestViewer } from '@/lib/auth/session'
import { route } from '@/lib/http'

// A3: the signed-in user's own email, verification and admin flag (never anyone else's), or null.
export const GET = route(async (req) => {
  const user = await getRequestViewer(req)
  return NextResponse.json(
    { success: true, data: { user } },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
