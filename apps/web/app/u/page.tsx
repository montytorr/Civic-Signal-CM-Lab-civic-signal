import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/server'

export default async function Page() {
  const viewer = await getViewer()
  if (!viewer) redirect('/auth/signin')
  if (viewer.handle) redirect(`/u/${viewer.handle}`)
  redirect('/verify')
}
