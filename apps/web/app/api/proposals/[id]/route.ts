import { NextResponse } from 'next/server'
import { queryOne, withTransaction, type PollProposalRow } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { assertProposer, canUpdateOwnProposal, proposerTransition, requireUser } from '@/lib/authz'
import { HttpError, isUuid, mutation, readJson } from '@/lib/http'
import { assertValidProposal, optionsOf, proposalEdits, setClause } from '@/lib/proposals'

type Params = { params: Promise<{ id: string }> }

// R6 (D14): the proposer's workflow. Only the proposer; appeal only from rejected; revise only
// from changes_requested or rejected, back to pending with revision_count bumped. P23: `edit`
// changes a pending proposal's fields and nothing else. The owner never changes (proposed_by is
// not an editable field). An edited proposal must still pass the creation rules.
export const PATCH = mutation(async (req, { params }: Params) => {
  const { id } = await params
  const viewer = requireUser(await getRequestViewer(req))
  const body = await readJson(req)
  if (body.action !== 'appeal' && body.action !== 'revise' && body.action !== 'edit') {
    throw new HttpError(400, 'Invalid proposal action', 'INVALID_ACTION')
  }
  const action = body.action
  if (!isUuid(id)) throw new HttpError(404, 'Proposal not found')

  const proposal = await withTransaction(async (client) => {
    const current = await queryOne<PollProposalRow>('select * from poll_proposals where id = $1 for update', [id], client)
    if (!current) throw new HttpError(404, 'Proposal not found')
    assertProposer(viewer, current)

    if (action === 'appeal') {
      const next = proposerTransition(action, current.status)
      if (!next) throw new HttpError(409, 'Only rejected proposals can be appealed', 'INVALID_STATUS')
      const reason = typeof body.appealReason === 'string' ? body.appealReason.trim() : ''
      if (reason.length < 12) throw new HttpError(400, 'Appeal reason must explain what should be reconsidered', 'INVALID_BODY')
      return queryOne(
        `update poll_proposals set status = $2, appeal_reason = $3, appealed_at = now(), updated_at = now()
         where id = $1 returning id, status, appeal_reason, appealed_at`,
        [id, next, reason],
        client,
      )
    }

    if (action === 'edit' && !canUpdateOwnProposal(viewer, current, { proposed_by: current.proposed_by, status: current.status })) {
      throw new HttpError(409, 'Only pending proposals can be edited', 'INVALID_STATUS')
    }
    const next = action === 'revise' ? proposerTransition(action, current.status) : 'pending'
    if (!next) throw new HttpError(409, 'Only proposals needing changes or rejected proposals can be revised', 'INVALID_STATUS')

    const edits = proposalEdits(body)
    if (Object.keys(edits).length === 0) throw new HttpError(400, 'No valid fields provided', 'INVALID_BODY')
    await assertValidProposal({ ...current, options: optionsOf(current.options), ...edits }, client)

    const set = setClause(edits, 3)
    if (action === 'edit') {
      return queryOne(
        `update poll_proposals set ${set.sql}, updated_at = now()
         where id = $1 and status = $2 returning id, status, revision_count`,
        [id, 'pending', ...set.params],
        client,
      )
    }
    return queryOne(
      `update poll_proposals set ${set.sql}, status = $2, revision_count = revision_count + 1,
              appeal_reason = null, appealed_at = null, updated_at = now()
       where id = $1 returning id, status, revision_count`,
      [id, next, ...set.params],
      client,
    )
  })

  return NextResponse.json({ success: true, proposal })
})
