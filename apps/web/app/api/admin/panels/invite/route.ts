import { NextResponse } from 'next/server'
import { queryOne } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'

// R7, D10: panel membership is written by admins only.
export const POST = mutation(async (req) => {
  const viewer = requireAdmin(await getRequestViewer(req))
  const body = await readJson(req)
  const { topicId, userId } = body
  const minReputation = body.minReputation ?? 1
  const activate = body.activate ?? true

  if (!isUuid(topicId) || !isUuid(userId)) {
    throw new HttpError(400, 'topicId and userId are required', 'INVALID_BODY')
  }
  if (typeof minReputation !== 'number' || !Number.isInteger(minReputation)) {
    throw new HttpError(400, 'minReputation must be an integer', 'INVALID_BODY')
  }

  const rep = await queryOne<{ score: number }>(
    'select score from user_topic_reputation where topic_id = $1 and user_id = $2',
    [topicId, userId],
  )
  if (!rep || rep.score < minReputation) {
    throw new HttpError(403, `User needs at least ${minReputation} topic reputation`, 'INSUFFICIENT_REPUTATION')
  }

  const member = await queryOne(
    `insert into panel_members (topic_id, user_id, invited_by, status, min_reputation_at_invite, accepted_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (topic_id, user_id) do update set
       invited_by = excluded.invited_by, status = excluded.status,
       min_reputation_at_invite = excluded.min_reputation_at_invite, accepted_at = excluded.accepted_at
     returning id, topic_id, user_id, status, min_reputation_at_invite, invited_at, accepted_at`,
    [topicId, userId, viewer.id, activate ? 'active' : 'invited', minReputation, activate ? new Date().toISOString() : null],
  )
  return NextResponse.json({ success: true, member })
})
