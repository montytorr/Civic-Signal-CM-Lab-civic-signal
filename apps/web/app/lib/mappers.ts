import type { Poll } from '@civicsignal/ui'

/** The poll columns the UI card needs, as the poll queries return them. */
export type DbPollLike = {
  id: string
  question: string
  region: string
  cutoff_at: string
  resolves_at?: string | null
  options: unknown
  source_of_truth: string
  resolution_criteria?: string | null
  created_at?: string | null
  status?: string | null
  topics?: { slug?: string } | null
}

export const mapDbPollToUiPoll = (dbPoll: DbPollLike, voteCount: number, hasVoted: boolean): Poll => {
  const cutoff = new Date(dbPoll.cutoff_at)
  const now = new Date()
  const diff = cutoff.getTime() - now.getTime()

  let cutoffLabel = 'closed'
  if (diff > 0) {
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    if (days > 30) cutoffLabel = `in ${Math.floor(days / 30)}mo`
    else if (days > 0) cutoffLabel = `in ${days}d ${hours}h`
    else cutoffLabel = `in ${hours}h`
  }

  return {
    id: dbPoll.id,
    q: dbPoll.question,
    topic: dbPoll.topics?.slug ?? '',
    region: dbPoll.region,
    cutoff: dbPoll.cutoff_at,
    cutoffLabel,
    resolves: dbPoll.resolves_at?.split('T')[0] ?? '',
    participants: voteCount,
    options: Array.isArray(dbPoll.options) ? dbPoll.options.map(String) : JSON.parse(String(dbPoll.options)),
    source: dbPoll.source_of_truth,
    resolutionCriteria: dbPoll.resolution_criteria ?? null,
    createdAt: dbPoll.created_at ?? null,
    status: dbPoll.status === 'resolved' ? 'resolved' : (diff <= 0 ? 'closed' : 'active'),
    answered: hasVoted,
  }
}
