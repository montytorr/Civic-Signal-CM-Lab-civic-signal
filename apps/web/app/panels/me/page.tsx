import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/server'
import { getMyPanelWorkspace } from '@/lib/queries'
import { PanelWorkspacePage } from '@/components/panel-workspace-page'

export const metadata: Metadata = {
  title: 'Panel workspace | CivicSignal',
}

export default async function Page() {
  const viewer = await getViewer()
  if (!viewer) redirect('/auth/signin')
  const workspace = await getMyPanelWorkspace(viewer)
  return <PanelWorkspacePage memberships={workspace.memberships} disputes={workspace.disputes} />
}
