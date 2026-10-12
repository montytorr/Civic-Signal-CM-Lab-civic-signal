import { NextResponse } from 'next/server'
import { queryOne } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'
import { REPUTATION_TIERS, tierLabel, tierOf, tierRank, type ReputationTier } from '@/lib/reputation'

// R7, D10: panel membership is written by admins only. The bar is a minimum tier (P10): a free
// numeric threshold would let anyone who can call this find a user's exact score by trial.
// minReputation is still accepted and rounded down to its tier.
export const POST = mutation(async (req) => {
  const viewer = requireAdmin(await getRequestViewer(req))
  const body = await readJson(req)
  const { topicId, userId } = body
  const activate = body.activate ?? true

  if (!isUuid(topicId) || !isUuid(userId)) {
    throw new HttpError(400, 'topicId and userId are required', 'INVALID_BODY')
  }
  let minTier: ReputationTier
  if (typeof body.minTier === 'string') {
    const tier = REPUTATION_TIERS.find((t) => t.key === body.minTier && t.min > 0)
    if (!tier) throw new HttpError(400, 'minTier must be a tier above newcomer', 'INVALID_BODY')
    minTier = tier.key
  } else if (body.minReputation === undefined || (typeof body.minReputation === 'number' && Number.isInteger(body.minReputation))) {
    minTier = tierOf(Math.max(1, (body.minReputation as number | undefined) ?? 1))
  } else {
    throw new HttpError(400, 'minReputation must be an integer', 'INVALID_BODY')
  }
  const minScore = REPUTATION_TIERS.find((t) => t.key === minTier)!.min

  // Server-internal: the exact score is compared here and never returned.
  const rep = await queryOne<{ score: number }>(
    'select score from user_topic_reputation where topic_id = $1 and user_id = $2',
    [topicId, userId],
  )
  if (!rep || tierRank(tierOf(rep.score)) < tierRank(minTier)) {
    throw new HttpError(403, `User needs at least the ${tierLabel(minTier)} tier in this topic`, 'INSUFFICIENT_REPUTATION')
  }

  const member = await queryOne(
    `insert into panel_members (topic_id, user_id, invited_by, status, min_reputation_at_invite, accepted_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (topic_id, user_id) do update set
       invited_by = excluded.invited_by, status = excluded.status,
       min_reputation_at_invite = excluded.min_reputation_at_invite, accepted_at = excluded.accepted_at
     returning id, topic_id, user_id, status, min_reputation_at_invite, invited_at, accepted_at`,
    [topicId, userId, viewer.id, activate ? 'active' : 'invited', minScore, activate ? new Date().toISOString() : null],
  )
  return NextResponse.json({ success: true, member })
})
