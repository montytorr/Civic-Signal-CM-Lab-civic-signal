import { NextResponse } from 'next/server'
import { queryOne } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/authz'
import { HttpError, isUuid, route } from '@/lib/http'
import type { PollWithTopic } from '@/lib/queries'

type Params = { params: Promise<{ id: string }> }

// R3, P6: any poll, drafts included, so it needs users.is_admin (not just a session).
export const GET = route(async (req, { params }: Params) => {
  requireAdmin(await getRequestViewer(req))
  const { id } = await params
  const poll = isUuid(id)
    ? await queryOne<PollWithTopic>(
        `select p.*, case when t.id is null then null else json_build_object('slug', t.slug, 'label', t.label) end as topics
         from polls p left join topics t on t.id = p.topic_id
         where p.id = $1`,
        [id],
      )
    : null
  if (!poll) throw new HttpError(404, 'Poll not found')
  return NextResponse.json({ success: true, data: poll })
})
