import { NextResponse } from 'next/server'
import { createVoteReceipt, encryptVote } from '@civicsignal/crypto'
import { queryOne, withTransaction, type PollRow, type VoteRow } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { isPublicPoll, ownedRow, requireUser, requireVerified } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'
import { ensurePollPublicKey } from '@/lib/polls'
import { enforceRateLimit } from '@/lib/rate-limit'

type Params = { params: Promise<{ id: string }> }

// R1: signed in and verified. P7: the vote is the viewer's own (user_id = U, whatever the body
// says). P5: only a public poll can be found, and only an active one before cutoff takes votes.
// The answer is sealed here, server-side, to the poll's public key (public material) and only the
// ciphertext is stored; any ciphertext the client sends is ignored. The answer is never logged.
export const POST = mutation(async (req, { params }: Params) => {
  const { id: pollId } = await params
  const user = requireUser(await getRequestViewer(req))

  // 10 vote submissions per user per hour across all polls. The unique (poll_id, user_id)
  // constraint prevents double votes; this limits bursts from client bugs or abuse.
  enforceRateLimit(`vote:${user.id}`, 10, 60 * 60 * 1000, 'Too many requests. Try again later.')

  const viewer = requireVerified(user, 'You must verify your email before voting')
  const body = await readJson(req)
  const { answer } = body
  if (!isUuid(pollId)) throw new HttpError(404, 'Poll not found', 'POLL_NOT_FOUND')

  const result = await withTransaction(async (client) => {
    // A share lock: resolution (which locks the poll for update) waits for this vote, or this vote
    // sees the poll already resolved.
    const poll = await queryOne<Pick<PollRow, 'id' | 'status' | 'cutoff_at' | 'options'>>(
      'select id, status, cutoff_at, options from polls where id = $1 for share',
      [pollId],
      client,
    )
    if (!poll || !isPublicPoll(poll)) throw new HttpError(404, 'Poll not found', 'POLL_NOT_FOUND')
    if (poll.status !== 'active') throw new HttpError(409, 'Poll is not accepting votes', 'POLL_CLOSED')
    if (new Date(poll.cutoff_at) <= new Date()) throw new HttpError(409, 'Poll cutoff has passed', 'POLL_CUTOFF_PASSED')

    const options = Array.isArray(poll.options) ? poll.options.map(String) : []
    if (typeof answer !== 'string' || !options.includes(answer)) {
      throw new HttpError(400, 'A valid answer is required', 'INVALID_ANSWER')
    }

    const already = await queryOne('select 1 from votes where poll_id = $1 and user_id = $2', [pollId, viewer.id], client)
    if (already) throw new HttpError(409, 'You have already voted on this poll', 'ALREADY_VOTED')

    const encryptedAnswer = encryptVote(answer, await ensurePollPublicKey(client, pollId))
    const receipt = createVoteReceipt(pollId, viewer.id, encryptedAnswer)
    const row = ownedRow(viewer, 'votes', { poll_id: pollId, encrypted_answer: encryptedAnswer, receipt_hash: receipt.hash })
    const vote = await queryOne<Pick<VoteRow, 'id'>>(
      `insert into votes (poll_id, user_id, encrypted_answer, receipt_hash)
       values ($1, $2, $3, $4)
       on conflict (poll_id, user_id) do nothing
       returning id`,
      [row.poll_id, row.user_id, row.encrypted_answer, row.receipt_hash],
      client,
    )
    if (!vote) throw new HttpError(409, 'You have already voted on this poll', 'ALREADY_VOTED')
    return { voteId: vote.id, receipt }
  })

  return NextResponse.json({
    success: true,
    data: {
      voteId: result.voteId,
      receipt: {
        hash: result.receipt.hash,
        shortHash: result.receipt.shortHash,
        timestamp: result.receipt.timestamp,
        pollId: result.receipt.pollId,
      },
    },
  })
})
