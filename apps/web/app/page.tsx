import type { Metadata } from 'next'
import { getActivePolls, getPlatformStats, getVoteCountsByPoll } from '@/lib/queries'
import { mapDbPollToUiPoll } from '@/lib/mappers'
import { LandingPage } from '@/components/landing-page'

export const metadata: Metadata = {
  title: 'CivicSignal — Verified-human polling for public intelligence',
  description: 'Verified-human polling for public intelligence.',
}

export default async function Page() {
  const [dbPolls, stats] = await Promise.all([getActivePolls(), getPlatformStats()])
  const visiblePolls = dbPolls.slice(0, 4)
  const voteCounts = await getVoteCountsByPoll(visiblePolls.map((p) => p.id))
  const polls = visiblePolls.map((p) => mapDbPollToUiPoll(p, voteCounts.get(p.id) ?? 0, false))
  return <LandingPage polls={polls} stats={stats} />
}
