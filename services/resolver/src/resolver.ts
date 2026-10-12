import { buildMerkleRoot, decryptVote } from '@civicsignal/crypto'
import { getPool, insertRow, query, queryOne, scoreResolvedPoll, withTransaction, type Pool } from '@civicsignal/db'

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

// ─── Step 3: Score resolved polls ─────────────────────────────────────────────

export const processResolutions = async (pool: Pool = getPool()) => {
  // Resolved polls with an outcome that have not been scored yet (no results, no reputation events).
  // The admin resolution route scores in the same transaction as the outcome, so this mostly
  // catches polls resolved by other means.
  const unprocessedPolls = await query<{ id: string; question: string }>(
    `select p.id, p.question from polls p
     where p.status = 'resolved'
       and p.outcome is not null
       and not exists (select 1 from reputation_events e where e.poll_id = p.id)
       and not exists (select 1 from poll_results r where r.poll_id = p.id)`,
    [],
    pool,
  )

  if (unprocessedPolls.length === 0) return

  console.log(`[resolver] Scoring ${unprocessedPolls.length} resolved poll(s)`)

  for (const poll of unprocessedPolls) {
    try {
      await processPoll(pool, poll.id)
    } catch (err) {
      console.error(`[resolver] Failed to score poll ${poll.id}:`, (err as Error).message)
    }
  }
}

// Decrypt in memory with the key from the server-only poll_secrets table (S1) and score through the
// shared scoreResolvedPoll, so this path and the admin resolution route count the same way. The
// key and the answers are never logged or stored.
const processPoll = async (pool: Pool, pollId: string) => {
  await withTransaction(async (client) => {
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [pollId], client)
    const voteCount = await queryOne<{ n: string }>('select count(*) as n from votes where poll_id = $1', [pollId], client)
    if (!secret && Number(voteCount?.n ?? 0) > 0) {
      console.error(`[resolver] Poll ${pollId} has votes but no key in poll_secrets; cannot score it`)
      return
    }
    const result = await scoreResolvedPoll(client, {
      pollId,
      decrypt: (encryptedAnswer) => {
        if (!secret) throw new Error('no key')
        return decryptVote(encryptedAnswer, secret.secret_key)
      },
    })
    if (result.scored) {
      console.log(`[resolver] Poll ${pollId} — ${result.correctVotes}/${result.countedVotes} correct of ${result.totalVotes} vote(s), results and reputation written`)
    }
  }, pool)
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
