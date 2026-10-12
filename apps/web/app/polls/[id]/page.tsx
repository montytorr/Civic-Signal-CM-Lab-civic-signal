import type { Metadata } from 'next'
import { getViewer } from '@/lib/auth/server'
import { getPollById, getUserVote, getVoteCount, getPollPublicKey } from '@/lib/queries'
import { PollDetailPage } from '@/components/poll-detail-page'
import { mapDbPollToUiPoll } from '@/lib/mappers'
import { notFound, redirect } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const poll = await getPollById(id)
  return {
    title: poll?.question ? `${poll.question} | CivicSignal` : 'Poll | CivicSignal',
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  const viewer = await getViewer()
  const [dbPoll, vote, count, publicKey] = await Promise.all([
    getPollById(id),
    getUserVote(id, viewer),
    getVoteCount(id),
    getPollPublicKey(id),
  ])
  if (!dbPoll) notFound()
  if (dbPoll.status === 'resolved') redirect(`/polls/${id}/resolved`)
  const poll = mapDbPollToUiPoll(dbPoll, count, !!vote)
  return <PollDetailPage poll={poll} existingVote={vote} publicKey={publicKey} />
}
