import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { assertCanReviewDispute, ownedRow, requireUser } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'

const VALID_DECISIONS = ['uphold', 'dismiss'] as const
type Decision = typeof VALID_DECISIONS[number]

type Params = { params: Promise<{ id: string }> }

// R4: an admin, or an active panelist for the poll's topic, reviews an open dispute.
// P19, D12: the review is the viewer's own (reviewer_id = U); a second review replaces their first.
export const POST = mutation(async (req, { params }: Params) => {
  const viewer = requireUser(await getRequestViewer(req))
  const { id: disputeId } = await params
  const body = await readJson(req)
  const { decision, rationale } = body as { decision?: Decision; rationale?: unknown }
  if (!decision || !VALID_DECISIONS.includes(decision)) {
    throw new HttpError(400, 'decision must be uphold or dismiss', 'INVALID_DECISION')
  }
  if (typeof rationale !== 'string' || rationale.trim().length < 8 || rationale.length > 2000) {
    throw new HttpError(400, 'rationale is required (8-2000 chars)', 'INVALID_BODY')
  }
  if (!isUuid(disputeId)) throw new HttpError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND')

  const result = await withTransaction(async (client) => {
    const dispute = await queryOne<{ id: string; poll_id: string; status: string; topic_id: string | null }>(
      `select d.id, d.poll_id, d.status, p.topic_id
       from disputes d left join polls p on p.id = d.poll_id
       where d.id = $1
       for update of d`,
      [disputeId],
      client,
    )
    if (!dispute) throw new HttpError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND')
    const panelist = dispute.topic_id
      ? await queryOne(
          `select 1 from panel_members where topic_id = $1 and user_id = $2 and status = 'active'`,
          [dispute.topic_id, viewer.id],
          client,
        )
      : null
    assertCanReviewDispute(viewer, dispute, !!panelist)

    const row = ownedRow(viewer, 'dispute_reviews', { dispute_id: disputeId, decision, rationale: rationale.trim() })
    const review = await queryOne(
      `insert into dispute_reviews (dispute_id, reviewer_id, decision, rationale)
       values ($1, $2, $3, $4)
       on conflict (dispute_id, reviewer_id) do update set decision = excluded.decision, rationale = excluded.rationale
       returning id, decision, rationale, reviewer_id, created_at`,
      [row.dispute_id, row.reviewer_id, row.decision, row.rationale],
      client,
    )

    await client.query(`update disputes set status = 'reviewing' where id = $1 and status = 'open'`, [disputeId])

    const reviews = await query<{ decision: Decision }>('select decision from dispute_reviews where dispute_id = $1', [disputeId], client)
    const counts = reviews.reduce((acc, r) => {
      acc[r.decision] = (acc[r.decision] ?? 0) + 1
      return acc
    }, {} as Record<Decision, number>)

    const closedAs = counts.uphold >= 2 ? 'upheld' : counts.dismiss >= 2 ? 'dismissed' : null
    if (closedAs) {
      await client.query(
        `update disputes set status = $2, resolved_at = now(), resolution_notes = $3 where id = $1`,
        [disputeId, closedAs, `Panel review: ${closedAs}`],
      )
      if (closedAs === 'upheld') await client.query(`update polls set status = 'disputed' where id = $1`, [dispute.poll_id])
    }
    return { review, counts, closedAs }
  })

  return NextResponse.json({ success: true, ...result })
})
