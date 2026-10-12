import type { Metadata } from 'next'
import { getActivePolls, getTopics, getVoteCountsByPoll } from '@/lib/queries'
import { FeedPage } from '@/components/feed-page'
import { mapDbPollToUiPoll } from '@/lib/mappers'

export const metadata: Metadata = {
  title: 'Active Polls | CivicSignal',
}

export default async function Page() {
  const [dbPolls, rawTopics] = await Promise.all([getActivePolls(), getTopics()])
  const voteCounts = await getVoteCountsByPoll(dbPolls.map((p) => p.id))
  const polls = dbPolls.map((p) => mapDbPollToUiPoll(p, voteCounts.get(p.id) ?? 0, false))
  return <FeedPage polls={polls} topics={rawTopics.map((t) => t.label)} />
}
