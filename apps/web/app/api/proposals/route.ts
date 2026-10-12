import { NextResponse } from 'next/server'
import { queryOne } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { ownedRow, requireVerified } from '@/lib/authz'
import { mutation, readJson, route } from '@/lib/http'
import { assertValidProposal, proposalEdits } from '@/lib/proposals'
import { getPollProposals } from '@/lib/queries'

// P21: every proposal is public.
export const GET = route(async () => NextResponse.json({ success: true, proposals: await getPollProposals(100) }))

// R2: signed in and verified. P22: the proposal is the viewer's own (proposed_by = U).
export const POST = mutation(async (req) => {
  const viewer = requireVerified(await getRequestViewer(req), 'Verified account required')
  const fields = proposalEdits(await readJson(req))
  await assertValidProposal(fields)

  const row = ownedRow(viewer, 'poll_proposals', { ...fields, options: JSON.stringify(fields.options) })
  const proposal = await queryOne<{ id: string }>(
    `insert into poll_proposals (proposed_by, topic_id, question, region, options, source_of_truth, resolution_criteria, cutoff_at, resolves_at, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     returning id`,
    [row.proposed_by, row.topic_id, row.question, row.region, row.options, row.source_of_truth, row.resolution_criteria, row.cutoff_at, row.resolves_at],
  )
  return NextResponse.json({ success: true, proposal }, { status: 201 })
})
