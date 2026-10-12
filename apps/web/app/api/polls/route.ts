import { NextResponse } from 'next/server'
import { getActivePolls } from '@/lib/queries'
import { route } from '@/lib/http'

// P5: active and closed polls.
export const GET = route(async () => NextResponse.json({ success: true, data: await getActivePolls() }))
