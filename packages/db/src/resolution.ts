// Scoring a resolved poll, shared by the admin resolution route (apps/web) and the resolver
// (services/resolver) so both paths count and score the same way. Server-only.
//
// Ballots are decrypted in memory by the caller's `decrypt` (with the key from poll_secrets, S1).
// Only aggregates are written: answer totals to poll_results and each voter's correctness to
// reputation_events / user_topic_reputation. No plaintext answer is ever written back to votes.
import type { PoolClient } from 'pg'
import { insertRows } from './client'

export interface ScoreResult {
  /** False when the poll was already scored (results or reputation events exist): nothing written. */
  scored: boolean
  totalVotes: number
  /** Ballots that decrypted to one of the poll's options. */
  countedVotes: number
  correctVotes: number
  /** Votes per answer, every option included (zero when nobody chose it). */
  counts: Record<string, number>
}

/**
 * Score a poll with a recorded outcome, inside the caller's transaction. Locks the poll row, so a
 * concurrent scorer waits and then finds it done. A ballot that does not decrypt to one of the
 * poll's options counts toward no answer and earns no reputation event.
 */
export const scoreResolvedPoll = async (
  client: PoolClient,
  { pollId, decrypt }: { pollId: string; decrypt: (encryptedAnswer: string) => string },
): Promise<ScoreResult> => {
  const { rows: polls } = await client.query<{ topic_id: string; outcome: string | null; options: unknown }>(
    'select topic_id, outcome, options from polls where id = $1 for update',
    [pollId],
  )
  const poll = polls[0]
  if (!poll || poll.outcome == null) throw new Error(`poll ${pollId} has no outcome to score against`)
  const options = Array.isArray(poll.options) ? poll.options.map(String) : []
  const counts: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]))

  const { rows: done } = await client.query(
    `select 1 where exists (select 1 from poll_results where poll_id = $1)
        or exists (select 1 from reputation_events where poll_id = $1)`,
    [pollId],
  )
  const { rows: votes } = await client.query<{ id: string; user_id: string; encrypted_answer: string }>(
    'select id, user_id, encrypted_answer from votes where poll_id = $1 order by created_at, id',
    [pollId],
  )
  if (done.length > 0) return { scored: false, totalVotes: votes.length, countedVotes: 0, correctVotes: 0, counts }

  const outcome = poll.outcome.trim()
  const events: { user_id: string; poll_id: string; topic_id: string; delta: number }[] = []
  for (const vote of votes) {
    let answer: string
    try {
      answer = decrypt(vote.encrypted_answer).trim()
    } catch {
      console.error(`[resolution] vote ${vote.id} of poll ${pollId} does not decrypt; not counted`)
      continue
    }
    if (!Object.hasOwn(counts, answer)) {
      console.error(`[resolution] vote ${vote.id} of poll ${pollId} is not one of the options; not counted`)
      continue
    }
    counts[answer] += 1
    events.push({ user_id: vote.user_id, poll_id: pollId, topic_id: poll.topic_id, delta: answer === outcome ? 1 : 0 })
  }

  await insertRows('poll_results', Object.entries(counts).map(([answer, n]) => ({ poll_id: pollId, answer, votes: n })), client)
  await insertRows('reputation_events', events, client)
  for (const event of events) {
    await client.query(
      `insert into user_topic_reputation (user_id, topic_id, score, resolved_count, correct_count)
       values ($1, $2, $3, 1, $3)
       on conflict (user_id, topic_id) do update set
         score = coalesce(user_topic_reputation.score, 0) + excluded.score,
         resolved_count = coalesce(user_topic_reputation.resolved_count, 0) + 1,
         correct_count = coalesce(user_topic_reputation.correct_count, 0) + excluded.correct_count`,
      [event.user_id, event.topic_id, event.delta],
    )
  }

  return {
    scored: true,
    totalVotes: votes.length,
    countedVotes: events.length,
    correctVotes: events.filter((e) => e.delta === 1).length,
    counts,
  }
}
