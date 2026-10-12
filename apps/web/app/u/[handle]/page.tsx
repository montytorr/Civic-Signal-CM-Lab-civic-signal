import { getViewer } from '@/lib/auth/server'
import { getUserProfile, getUserReputation, getRecentContributions, getPendingVotes } from '@/lib/queries'
import { ReputationPage } from '@/components/reputation-page'
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await getUserProfile(handle)
  if (!profile) return notFound()
  const viewer = await getViewer()
  const [reputation, contributions, pendingVotes] = await Promise.all([
    getUserReputation(profile.id),
    getRecentContributions(profile.id),
    // P8: only the profile's owner sees their votes.
    getPendingVotes(profile.id, viewer),
  ])
  return <ReputationPage profile={profile} reputation={reputation} contributions={contributions} pendingVotes={pendingVotes} />
}
