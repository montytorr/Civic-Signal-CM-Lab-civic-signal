import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/server'
import { getTopics, getOpenDisputes, getAwaitingResolution, getAuditStats, getPanelInviteCandidates, getPendingPollProposals } from '@/lib/queries'
import { AdminPage } from '@/components/admin-page'

export const metadata: Metadata = {
  title: 'Admin | CivicSignal',
}

export default async function Page() {
  // P6: users.is_admin, read fresh from the database.
  const viewer = await getViewer()
  if (!viewer?.isAdmin) redirect('/polls')

  const [topics, disputes, awaitingResolution, auditStats, panelCandidates, pendingProposals] = await Promise.all([
    getTopics(),
    getOpenDisputes(),
    getAwaitingResolution(),
    getAuditStats(),
    getPanelInviteCandidates(),
    getPendingPollProposals(),
  ])

  return (
    <AdminPage
      topics={topics}
      disputes={disputes}
      awaitingResolution={awaitingResolution}
      auditStats={auditStats}
      panelCandidates={panelCandidates}
      pendingProposals={pendingProposals}
    />
  )
}
