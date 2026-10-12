import { NextResponse } from 'next/server'
import { queryOne, type PollRow } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation } from '@/lib/http'

type Params = { params: Promise<{ id: string }> }

// R3, P6: draft → active.
export const POST = mutation(async (req, { params }: Params) => {
  requireAdmin(await getRequestViewer(req))
  const { id } = await params
  const poll = isUuid(id) ? await queryOne<Pick<PollRow, 'id' | 'status'>>('select id, status from polls where id = $1', [id]) : null
  if (!poll) throw new HttpError(404, 'Poll not found')
  if (poll.status !== 'draft') {
    throw new HttpError(409, `Cannot publish a poll with status "${poll.status}"`, 'INVALID_STATUS')
  }

  const updated = await queryOne<PollRow>(
    `update polls set status = 'active' where id = $1 and status = 'draft' returning *`,
    [id],
  )
  if (!updated) throw new HttpError(409, 'Poll is no longer a draft', 'INVALID_STATUS')
  return NextResponse.json({ success: true, data: updated })
})
