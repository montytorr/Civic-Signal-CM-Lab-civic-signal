import { NextResponse } from 'next/server'
import { queryOne, withTransaction, type PollProposalRow, type PoolClient } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { assertNoSecretKey, requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'
import { createDraftPoll } from '@/lib/polls'
import { assertValidProposal, optionsOf, proposalEdits, setClause, type ProposalFields } from '@/lib/proposals'

const ACTIONS = ['approve', 'reject', 'changes_requested', 'update'] as const
type Action = typeof ACTIONS[number]
type Params = { params: Promise<{ id: string }> }

// Update a proposal: the edited columns plus the given moderation columns (fixed names only).
const updateProposal = (client: PoolClient, id: string, values: Record<string, unknown>) => {
  const set = setClause(values, 2)
  return queryOne<PollProposalRow>(
    `update poll_proposals set ${set.sql}, updated_at = now() where id = $1 returning *`,
    [id, ...set.params],
    client,
  )
}

// R8, D14: moderation is admin-only. An approved proposal (it has its poll) cannot be moderated
// again. Edits and approval must leave a proposal that passes the creation rules. Approval creates
// the draft poll; S1: its secret key goes to poll_secrets in the same transaction and never into the
// response.
export const PATCH = mutation(async (req, { params }: Params) => {
  const viewer = requireAdmin(await getRequestViewer(req))
  const { id } = await params
  const body = await readJson(req)
  const action = body.action as Action
  if (!ACTIONS.includes(action)) throw new HttpError(400, 'Invalid moderation action', 'INVALID_ACTION')
  if (!isUuid(id)) throw new HttpError(404, 'Proposal not found')
  const notes = typeof body.moderatorNotes === 'string' ? body.moderatorNotes : null
  const edits = proposalEdits(body)

  const result = await withTransaction(async (client) => {
    const current = await queryOne<PollProposalRow>('select * from poll_proposals where id = $1 for update', [id], client)
    if (!current) throw new HttpError(404, 'Proposal not found')
    if (current.status === 'approved' || current.poll_id) {
      throw new HttpError(409, 'Proposal is already approved', 'INVALID_STATUS')
    }

    const merged: ProposalFields = {
      question: current.question,
      topic_id: current.topic_id,
      region: current.region,
      options: optionsOf(current.options),
      source_of_truth: current.source_of_truth,
      resolution_criteria: current.resolution_criteria,
      cutoff_at: current.cutoff_at,
      resolves_at: current.resolves_at,
      ...edits,
    }
    if (action === 'approve' || Object.keys(edits).length > 0) await assertValidProposal(merged, client)

    if (action === 'update') {
      return { proposal: await updateProposal(client, id, { ...edits, moderator_notes: notes ?? current.moderator_notes }) }
    }

    if (action === 'reject' || action === 'changes_requested') {
      const proposal = await updateProposal(client, id, {
        ...edits,
        status: action === 'reject' ? 'rejected' : 'changes_requested',
        moderator_id: viewer.id,
        moderator_notes: notes,
        moderated_at: new Date().toISOString(),
      })
      return { proposal }
    }

    const { poll } = await createDraftPoll(client, { ...merged, created_by: current.proposed_by }, { proposalId: id })
    const proposal = await updateProposal(client, id, {
      ...edits,
      status: 'approved',
      poll_id: poll.id,
      moderator_id: viewer.id,
      moderator_notes: notes ?? 'Approved into draft poll.',
      moderated_at: new Date().toISOString(),
    })
    return { proposal, poll: { id: poll.id } }
  })

  return NextResponse.json(assertNoSecretKey({ success: true, ...result }))
})
