import type { Metadata } from 'next'
import { getTopics, getTopicLeaderboard } from '@/lib/queries'
import { LeaderboardPage } from '@/components/leaderboard-page'

export const metadata: Metadata = {
  title: 'Leaderboard | CivicSignal',
}

type Props = {
  searchParams: Promise<{ topic?: string }>
}

export default async function Page({ searchParams }: Props) {
  const { topic: topicSlug } = await searchParams
  const topics = await getTopics()
  const firstSlug = topics[0]?.slug ?? ''
  const selectedSlug = topicSlug ?? firstSlug

  const leaderboard = selectedSlug ? await getTopicLeaderboard(selectedSlug) : []

  return (
    <LeaderboardPage
      topics={topics}
      selectedSlug={selectedSlug}
      leaderboard={leaderboard}
    />
  )
}
