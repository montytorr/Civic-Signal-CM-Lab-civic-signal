import { NextResponse } from 'next/server'
import { getAuditCommitments, getAuditOverview, getPollProposals, getPublicDisputes, getSourceTemplates } from '@/lib/queries'
import { route } from '@/lib/http'

// Public tables only (P11, P12, P20, P21), poll questions only for public polls (P5).
export const GET = route(async () => {
  const [overview, commitments, proposals, sourceTemplates, disputes] = await Promise.all([
    getAuditOverview(),
    getAuditCommitments(),
    getPollProposals(250),
    getSourceTemplates(),
    getPublicDisputes(250),
  ])

  return NextResponse.json({
    schema: 'civicsignal.audit-export.v1',
    generatedAt: new Date().toISOString(),
    overview,
    commitments,
    proposals,
    sourceTemplates,
    disputes,
  })
})
