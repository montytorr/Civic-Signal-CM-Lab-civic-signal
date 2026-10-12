import type { Metadata } from 'next'
import { getResolvedPolls } from '@/lib/queries'
import { ArchivePage } from '@/components/archive-page'

export const metadata: Metadata = {
  title: 'Archive | CivicSignal',
}

export default async function Page() {
  const polls = await getResolvedPolls()
  return <ArchivePage polls={polls} />
}
