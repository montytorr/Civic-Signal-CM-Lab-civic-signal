import { getPollById, getVoteCount, getVoteDistribution } from '@/lib/queries'
import { ResolvedPage } from '@/components/resolved-page'
import { redirect, notFound } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: Props) {
  const { id } = await params
  const [dbPoll, count, distribution] = await Promise.all([getPollById(id), getVoteCount(id), getVoteDistribution(id)])

  if (!dbPoll) notFound()
  if (dbPoll.status !== 'resolved') redirect(`/polls/${id}`)

  const options: string[] = Array.isArray(dbPoll.options)
    ? (dbPoll.options as string[])
    : JSON.parse(dbPoll.options as string)

  return (
    <ResolvedPage
      id={dbPoll.id}
      question={dbPoll.question}
      topicSlug={dbPoll.topics?.slug ?? ''}
      region={dbPoll.region}
      resolvedAt={dbPoll.resolved_at ?? dbPoll.resolves_at}
      outcome={dbPoll.outcome ?? ''}
      options={options}
      distribution={Object.fromEntries(distribution)}
      participants={count}
      source={dbPoll.source_of_truth}
      sourceUrl={dbPoll.resolution_source_url ?? null}
      notes={dbPoll.resolution_notes ?? null}
      commitmentHash={dbPoll.commitment_hash ?? null}
      topicLabel={dbPoll.topics?.label ?? null}
    />
  )
}
