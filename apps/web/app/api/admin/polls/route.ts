import { NextResponse } from 'next/server'
import { query, withTransaction } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { assertNoSecretKey, requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson, route } from '@/lib/http'
import { createDraftPoll } from '@/lib/polls'
import type { PollWithTopic } from '@/lib/queries'

const invalid = (error: string, code = 'INVALID_BODY') => new HttpError(400, error, code)

// R3, P6: every poll in every status, for admins only.
export const GET = route(async (req) => {
  requireAdmin(await getRequestViewer(req))
  const polls = await query<PollWithTopic>(
    `select p.*, case when t.id is null then null else json_build_object('slug', t.slug, 'label', t.label) end as topics
     from polls p left join topics t on t.id = p.topic_id
     order by p.created_at desc`,
  )
  return NextResponse.json({ success: true, data: polls })
})

// R3, P6: create a draft poll. S1: the secret key goes to poll_secrets, never into the response.
export const POST = mutation(async (req) => {
  const viewer = requireAdmin(await getRequestViewer(req))
  const body = await readJson(req)
  const { question, topicId, region, options, sourceOfTruth, resolutionCriteria, cutoffAt, resolvesAt } = body

  if (!question || !topicId || !region || !options || !sourceOfTruth || !cutoffAt || !resolvesAt) {
    throw invalid('Missing required fields')
  }
  if (typeof question !== 'string' || question.trim().length === 0 || question.trim().length > 500) {
    throw invalid('question must be a non-empty string (max 500 chars)')
  }
  if (!isUuid(topicId)) throw invalid('topicId must be a topic id')
  if (typeof region !== 'string' || region.trim().length === 0 || region.trim().length > 100) {
    throw invalid('region must be a non-empty string (max 100 chars)')
  }
  if (!Array.isArray(options) || options.length < 2) throw invalid('options must be an array with at least 2 entries', 'INVALID_OPTIONS')
  if (!options.every((o: unknown) => typeof o === 'string' && o.trim().length > 0)) {
    throw invalid('Each option must be a non-empty string', 'INVALID_OPTIONS')
  }
  if (typeof sourceOfTruth !== 'string' || sourceOfTruth.trim().length === 0 || sourceOfTruth.trim().length > 500) {
    throw invalid('sourceOfTruth must be a non-empty string (max 500 chars)')
  }
  if (resolutionCriteria != null && typeof resolutionCriteria !== 'string') throw invalid('resolutionCriteria must be a string')
  const cutoffDate = new Date(String(cutoffAt))
  const resolvesDate = new Date(String(resolvesAt))
  if (isNaN(cutoffDate.getTime()) || isNaN(resolvesDate.getTime())) throw invalid('cutoffAt and resolvesAt must be valid date strings')
  if (resolvesDate <= cutoffDate) throw invalid('resolvesAt must be after cutoffAt')

  const topic = await query('select 1 from topics where id = $1', [topicId])
  if (topic.length === 0) throw invalid('Unknown topic')

  const created = await withTransaction((client) =>
    createDraftPoll(client, {
      question,
      topic_id: topicId,
      region,
      options: options as string[],
      source_of_truth: sourceOfTruth,
      resolution_criteria: (resolutionCriteria as string | null | undefined) ?? null,
      cutoff_at: cutoffDate.toISOString(),
      resolves_at: resolvesDate.toISOString(),
      created_by: viewer.id,
    }),
  )

  return NextResponse.json(assertNoSecretKey({ success: true, data: { poll: created.poll, publicKey: created.publicKey } }), { status: 201 })
})
