import { NextResponse } from 'next/server'
import { getPollById } from '@/lib/queries'
import { HttpError, route } from '@/lib/http'

type Params = { params: Promise<{ id: string }> }

// P5: a public poll; draft and disputed polls are not found.
export const GET = route(async (_req, { params }: Params) => {
  const { id } = await params
  const poll = await getPollById(id)
  if (!poll) throw new HttpError(404, 'Poll not found')
  return NextResponse.json({ success: true, data: poll })
})
