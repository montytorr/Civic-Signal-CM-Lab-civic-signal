import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/server'
import { getOwnInvites } from '@/lib/queries'
import { InvitesPage } from '@/components/invites-page'

export default async function Page() {
  const viewer = await getViewer()
  if (!viewer) redirect('/auth/signin')

  return <InvitesPage initialInvites={await getOwnInvites(viewer)} />
}
