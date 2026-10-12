import { buildMerkleRoot, decryptVote } from '@civicsignal/crypto'
import { getPool, insertRow, insertRows, query, queryOne, withTransaction, type Pool } from '@civicsignal/db'

// ─── Step 1: Auto-close polls past their cutoff ──────────────────────────────

export const autoClosePolls = async (pool: Pool = getPool()) => {
  const closed = await query<{ id: string; question: string }>(
    `update polls set status = 'closed'
     where status = 'active' and cutoff_at < now()
     returning id, question`,
    [],
    pool,
  )

  if (closed.length === 0) return

  console.log(`[resolver] Closed ${closed.length} expired poll(s)`)
  for (const poll of closed) {
    console.log(`[resolver] Closed poll ${poll.id} — "${poll.question}"`)
  }
}

// ─── Step 2: Generate Merkle commitments for newly closed polls ───────────────

export const generateCommitments = async (pool: Pool = getPool()) => {
  // Closed polls that do not yet have an audit_commitment of type 'vote'
  const uncommittedPolls = await query<{ id: string; question: string }>(
    `select p.id, p.question from polls p
     where p.status = 'closed'
       and not exists (
         select 1 from audit_commitments a where a.poll_id = p.id and a.batch_type = 'vote'
       )`,
    [],
    pool,
  )

  if (uncommittedPolls.length === 0) return

  console.log(`[resolver] Generating commitments for ${uncommittedPolls.length} newly closed poll(s)`)

  for (const poll of uncommittedPolls) {
    try {
      const votes = await query<{ receipt_hash: string }>(
        'select receipt_hash from votes where poll_id = $1 order by created_at, id',
        [poll.id],
        pool,
      )

      const leaves = votes.map((v) => v.receipt_hash)
      const merkleRoot = buildMerkleRoot(leaves)

      await insertRow(
        'audit_commitments',
        { poll_id: poll.id, merkle_root: merkleRoot, batch_type: 'vote', metadata: { vote_count: leaves.length } },
        pool,
      )
      console.log(`[resolver] Committed Merkle root for poll ${poll.id} — ${leaves.length} vote(s), root: ${merkleRoot.slice(0, 16)}…`)
    } catch (err) {
      console.error(`[resolver] Failed to commit poll ${poll.id}:`, (err as Error).message)
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the plain-text answer from a stored vote value.
 * If a secretKey is available, attempts decryption; falls back to treating the
 * value as plain text so pre-encryption votes still score correctly.
 */
export const getPlainAnswer = (encryptedAnswer: string, secretKey: string | null): string => {
  if (!secretKey) return encryptedAnswer
  try {
    return decryptVote(encryptedAnswer, secretKey)
  } catch {
    return encryptedAnswer // fallback for pre-encryption votes
  }
}

// ─── Step 3: Process reputation for resolved polls ────────────────────────────

export const processResolutions = async (pool: Pool = getPool()) => {
  // Resolved polls with an outcome and no reputation events yet
  const unprocessedPolls = await query<{ id: string; topic_id: string; question: string; outcome: string }>(
    `select p.id, p.topic_id, p.question, p.outcome from polls p
     where p.status = 'resolved'
       and p.outcome is not null
       and not exists (select 1 from reputation_events e where e.poll_id = p.id)`,
    [],
    pool,
  )

  if (unprocessedPolls.length === 0) return

  console.log(`[resolver] Processing reputation for ${unprocessedPolls.length} resolved poll(s)`)

  for (const poll of unprocessedPolls) {
    try {
      await processPoll(pool, poll)
    } catch (err) {
      console.error(`[resolver] Failed to process reputation for poll ${poll.id}:`, (err as Error).message)
    }
  }
}

const processPoll = async (pool: Pool, poll: { id: string; topic_id: string; outcome: string }) => {
  const votes = await query<{ id: string; user_id: string; encrypted_answer: string }>(
    'select id, user_id, encrypted_answer from votes where poll_id = $1',
    [poll.id],
    pool,
  )

  if (votes.length === 0) {
    console.log(`[resolver] Poll ${poll.id} has no votes — skipping`)
    return
  }

  // The poll's secret key, written to the server-only poll_secrets table at poll creation.
  const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [poll.id], pool)
  const secretKey = secret?.secret_key ?? null
  if (secretKey) {
    console.log(`[resolver] Poll ${poll.id} — using encryption key for decryption`)
  } else {
    console.log(`[resolver] Poll ${poll.id} — no secret key found, treating answers as plain text`)
  }

  console.log(`[resolver] Processing ${votes.length} vote(s) for poll ${poll.id} — outcome: "${poll.outcome}"`)

  const reputationEvents = votes.map((vote) => {
    const isCorrect = getPlainAnswer(vote.encrypted_answer, secretKey).trim() === poll.outcome.trim()
    return { user_id: vote.user_id, poll_id: poll.id, topic_id: poll.topic_id, delta: isCorrect ? 1 : 0, isCorrect }
  })

  // Events and the per-topic totals land together or not at all.
  await withTransaction(async (client) => {
    await insertRows(
      'reputation_events',
      reputationEvents.map(({ isCorrect: _isCorrect, ...event }) => event),
      client,
    )

    for (const event of reputationEvents) {
      await client.query(
        `insert into user_topic_reputation (user_id, topic_id, score, resolved_count, correct_count)
         values ($1, $2, $3, 1, $4)
         on conflict (user_id, topic_id) do update set
           score = coalesce(user_topic_reputation.score, 0) + excluded.score,
           resolved_count = coalesce(user_topic_reputation.resolved_count, 0) + 1,
           correct_count = coalesce(user_topic_reputation.correct_count, 0) + excluded.correct_count`,
        [event.user_id, event.topic_id, event.delta, event.isCorrect ? 1 : 0],
      )
    }
  }, pool)

  const correctCount = reputationEvents.filter((e) => e.isCorrect).length
  console.log(`[resolver] Poll ${poll.id} — ${correctCount}/${votes.length} correct, reputation events written`)
}

/** One resolver pass: close, commit, score. Each step's failure is logged and does not stop the others. */
export const tick = async (pool: Pool = getPool()) => {
  try {
    await autoClosePolls(pool)
  } catch (err) {
    console.error('[resolver] autoClosePolls threw unexpectedly:', err)
  }

  try {
    await generateCommitments(pool)
  } catch (err) {
    console.error('[resolver] generateCommitments threw unexpectedly:', err)
  }

  try {
    await processResolutions(pool)
  } catch (err) {
    console.error('[resolver] processResolutions threw unexpectedly:', err)
  }
}
