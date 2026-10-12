import { NextResponse } from 'next/server'
import { queryOne, withTransaction, type PollRow } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { isPublicPoll, ownedRow, requireUser } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'

type Params = { params: Promise<{ id: string }> }

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000

// P13: the dispute is flagged by the viewer (flagged_by = U). P17: its evidence is submitted by
// the viewer (submitted_by = U). D8, D11: nothing else about disputes is writable here.
export const POST = mutation(async (req, { params }: Params) => {
  const { id: pollId } = await params
  const viewer = requireUser(await getRequestViewer(req))
  const body = await readJson(req)
  const { reason, evidenceUrl, evidenceSummary } = body

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new HttpError(400, 'reason is required', 'INVALID_BODY')
  }
  if (reason.trim().length > 1000) throw new HttpError(400, 'reason must be 1000 characters or fewer', 'INVALID_BODY')
  if (evidenceUrl !== undefined && (typeof evidenceUrl !== 'string' || evidenceUrl.length > 500)) {
    throw new HttpError(400, 'evidenceUrl must be a URL string (max 500 chars)', 'INVALID_BODY')
  }
  if (evidenceSummary !== undefined && (typeof evidenceSummary !== 'string' || evidenceSummary.length > 1000)) {
    throw new HttpError(400, 'evidenceSummary must be a string (max 1000 chars)', 'INVALID_BODY')
  }
  if (!isUuid(pollId)) throw new HttpError(404, 'Poll not found', 'POLL_NOT_FOUND')

  const dispute = await withTransaction(async (client) => {
    const poll = await queryOne<Pick<PollRow, 'id' | 'status' | 'topic_id' | 'resolved_at'>>(
      'select id, status, topic_id, resolved_at from polls where id = $1',
      [pollId],
      client,
    )
    if (!poll || !isPublicPoll(poll)) throw new HttpError(404, 'Poll not found', 'POLL_NOT_FOUND')
    if (poll.status !== 'resolved') throw new HttpError(409, 'Only resolved polls can be disputed', 'POLL_NOT_RESOLVED')
    if (!poll.resolved_at) throw new HttpError(409, 'Poll resolution timestamp missing', 'NO_RESOLVED_AT')
    if (Date.now() > new Date(poll.resolved_at).getTime() + DISPUTE_WINDOW_MS) {
      throw new HttpError(409, 'Dispute window has closed (24h after resolution)', 'WINDOW_CLOSED')
    }

    const reputation = await queryOne<{ score: number }>(
      'select score from user_topic_reputation where user_id = $1 and topic_id = $2',
      [viewer.id, poll.topic_id],
      client,
    )
    if (!reputation || reputation.score <= 0) {
      throw new HttpError(403, 'You must have reputation in this topic to dispute a resolution', 'NO_REPUTATION')
    }

    // Serialize this user's disputes on this poll so the duplicate check holds under concurrency.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`dispute:${pollId}:${viewer.id}`])
    const existing = await queryOne('select id from disputes where poll_id = $1 and flagged_by = $2', [pollId, viewer.id], client)
    if (existing) throw new HttpError(409, 'You have already flagged this resolution', 'ALREADY_DISPUTED')

    const disputeRow = ownedRow(viewer, 'disputes', { poll_id: pollId, reason: reason.trim() })
    const created = await queryOne<{ id: string }>(
      `insert into disputes (poll_id, flagged_by, reason, status) values ($1, $2, $3, 'open') returning id`,
      [disputeRow.poll_id, disputeRow.flagged_by, disputeRow.reason],
      client,
    )
    if (!created) throw new Error('dispute insert returned no row')

    const summary = typeof evidenceSummary === 'string' && evidenceSummary.trim() ? evidenceSummary.trim() : reason.trim()
    const sourceUrl = typeof evidenceUrl === 'string' && evidenceUrl.trim() ? evidenceUrl.trim() : null
    const evidence = ownedRow(viewer, 'dispute_evidence', { dispute_id: created.id, summary, source_url: sourceUrl })
    await client.query(
      'insert into dispute_evidence (dispute_id, submitted_by, summary, source_url) values ($1, $2, $3, $4)',
      [evidence.dispute_id, evidence.submitted_by, evidence.summary, evidence.source_url],
    )
    return created
  })

  return NextResponse.json({ success: true, dispute: { id: dispute.id } })
})
