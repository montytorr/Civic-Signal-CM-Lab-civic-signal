import { NextResponse } from 'next/server'
import { queryOne, withTransaction, type DisputeRow, type DisputeStatus } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'

const VALID_STATUSES: DisputeStatus[] = ['reviewing', 'upheld', 'dismissed']

type Params = { params: Promise<{ id: string }> }

// R5, D8: dispute status changes are admin-only. Upholding a dispute marks the poll disputed (D3).
export const PATCH = mutation(async (req, { params }: Params) => {
  requireAdmin(await getRequestViewer(req))
  const { id: disputeId } = await params
  const body = await readJson(req)
  const { status, notes } = body

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as DisputeStatus)) {
    throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`, 'INVALID_STATUS')
  }
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) {
    throw new HttpError(400, 'notes must be a string (max 2000 chars)', 'INVALID_BODY')
  }
  if (!isUuid(disputeId)) throw new HttpError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND')

  const updated = await withTransaction(async (client) => {
    const dispute = await queryOne<Pick<DisputeRow, 'id' | 'poll_id'>>('select id, poll_id from disputes where id = $1 for update', [disputeId], client)
    if (!dispute) throw new HttpError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND')

    const closing = status === 'upheld' || status === 'dismissed'
    const row = await queryOne<DisputeRow>(
      `update disputes set status = $2,
              resolved_at = case when $3 then now() else resolved_at end,
              resolution_notes = coalesce($4, resolution_notes)
       where id = $1 returning *`,
      [disputeId, status, closing, (notes as string | undefined) ?? null],
      client,
    )
    if (status === 'upheld') {
      await client.query(`update polls set status = 'disputed' where id = $1`, [dispute.poll_id])
    }
    return row
  })

  return NextResponse.json({ success: true, dispute: updated })
})
