import { NextResponse } from 'next/server'
import { buildMerkleRoot, decryptVote } from '@civicsignal/crypto'
import { insertRow, queryOne, scoreResolvedPoll, withTransaction, type PollRow, type VoteRow } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { assertNoSecretKey, requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'

type Params = { params: Promise<{ id: string }> }

// R3, P6: record a poll's outcome, tally the sealed ballots and score reputation (D5–D7 and P24
// writes, server-internal after the admin check). S1: the poll's secret key is read from
// poll_secrets, used in memory to decrypt, and never returned or logged; no answer is stored in
// plaintext anywhere, only the totals in poll_results.
export const POST = mutation(async (req, { params }: Params) => {
  const viewer = requireAdmin(await getRequestViewer(req))
  const { id: pollId } = await params
  const body = await readJson(req)
  const { outcome, notes, sourceUrl } = body

  if (!outcome || typeof outcome !== 'string') throw new HttpError(400, 'outcome is required', 'INVALID_BODY')
  if (notes != null && typeof notes !== 'string') throw new HttpError(400, 'notes must be a string', 'INVALID_BODY')
  if (sourceUrl != null && typeof sourceUrl !== 'string') throw new HttpError(400, 'sourceUrl must be a string', 'INVALID_BODY')
  if (!isUuid(pollId)) throw new HttpError(404, 'Poll not found')

  const result = await withTransaction(async (client) => {
    // Locking the poll row holds back concurrent votes (they check the poll under a share lock).
    const poll = await queryOne<Pick<PollRow, 'id' | 'status' | 'topic_id' | 'options'>>(
      'select id, status, topic_id, options from polls where id = $1 for update',
      [pollId],
      client,
    )
    if (!poll) throw new HttpError(404, 'Poll not found')
    if (poll.status !== 'active' && poll.status !== 'closed') {
      throw new HttpError(409, `Cannot resolve a poll with status "${poll.status}"`, 'INVALID_STATUS')
    }
    const options = Array.isArray(poll.options) ? poll.options.map(String) : []
    if (!options.includes(outcome)) {
      throw new HttpError(400, `"${outcome}" is not a valid option for this poll`, 'INVALID_OUTCOME')
    }

    // A poll that never got a vote may have no keypair (seeded polls get one on their first vote).
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [pollId], client)
    const ballots = await queryOne<{ n: string }>('select count(*) as n from votes where poll_id = $1', [pollId], client)
    if (!secret && Number(ballots?.n ?? 0) > 0) {
      throw new HttpError(500, 'Poll encryption key not found; cannot decrypt votes', 'KEYPAIR_MISSING')
    }

    const resolvedAt = new Date().toISOString()
    await client.query(
      `update polls set status = 'resolved', outcome = $2, resolution_notes = $3, resolution_source_url = $4,
              resolved_at = $5, resolved_by = $6
       where id = $1`,
      [pollId, outcome, notes ?? null, sourceUrl ?? null, resolvedAt, viewer.id],
    )

    // Decrypt in memory and score through the shared scorer (the resolver uses the same one):
    // answer totals to poll_results, correctness to reputation, nothing written back to votes.
    const score = await scoreResolvedPoll(client, { pollId, decrypt: (ciphertext) => {
      if (!secret) throw new Error('no key')
      return decryptVote(ciphertext, secret.secret_key)
    } })
    const { rows: votes } = await client.query<Pick<VoteRow, 'receipt_hash'>>(
      'select receipt_hash from votes where poll_id = $1 order by created_at, id',
      [pollId],
    )

    const correctVotes = score.correctVotes
    const merkleRoot = buildMerkleRoot(votes.map((v) => v.receipt_hash))
    const commitment = await insertRow(
      'audit_commitments',
      {
        poll_id: pollId,
        merkle_root: merkleRoot,
        batch_type: 'resolution',
        metadata: {
          outcome,
          resolvedAt,
          resolvedBy: viewer.id,
          totalVotes: votes.length,
          correctVotes,
          sourceUrl: (sourceUrl as string | null | undefined) ?? null,
        },
      },
      client,
    )

    const shortMerkle = `0x${merkleRoot.slice(0, 4).toUpperCase()}…${merkleRoot.slice(-4).toUpperCase()}`
    await client.query('update polls set commitment_hash = $2 where id = $1', [pollId, shortMerkle])

    return { pollId, outcome, totalVotes: votes.length, countedVotes: score.countedVotes, correctVotes, counts: score.counts, merkleRoot, commitmentId: commitment.id }
  })

  return NextResponse.json(assertNoSecretKey({ success: true, data: result }))
})
