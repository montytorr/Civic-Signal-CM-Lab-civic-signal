import type { Metadata } from 'next'
import { getViewer } from '@/lib/auth/server'
import { getPollProposals, getSourceTemplates, getTopics } from '@/lib/queries'
import { ProposalsPage } from '@/components/proposals-page'

export const metadata: Metadata = {
  title: 'Poll proposals | CivicSignal',
  description: 'Community poll proposal submission and public moderation log.',
}

export default async function Page() {
  const [viewer, topics, templates, proposals] = await Promise.all([
    getViewer(),
    getTopics(),
    getSourceTemplates(),
    getPollProposals(),
  ])

  return <ProposalsPage topics={topics} templates={templates} proposals={proposals} signedIn={Boolean(viewer)} />
}
