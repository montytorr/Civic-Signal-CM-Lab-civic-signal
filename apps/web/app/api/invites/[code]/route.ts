import { NextResponse } from 'next/server'
import { queryOne, withTransaction } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireUser } from '@/lib/authz'
import { HttpError, mutation } from '@/lib/http'

type Props = { params: Promise<{ code: string }> }

// D9: redeeming is a server-side update after these checks. The route never returns the invite
// row (P14: the redeemer could not read it before using it), only whether it worked.
export const POST = mutation(async (req, { params }: Props) => {
  const viewer = requireUser(await getRequestViewer(req))
  const { code } = await params

  await withTransaction(async (client) => {
    const invite = await queryOne<{ id: string; created_by: string | null; used_by: string | null }>(
      'select id, created_by, used_by from invites where code = $1 for update',
      [code.toUpperCase()],
      client,
    )
    if (!invite) throw new HttpError(404, 'Invite code not found', 'INVALID_CODE')
    if (invite.used_by) throw new HttpError(400, 'Invite code has already been used', 'CODE_USED')
    if (invite.created_by === viewer.id) throw new HttpError(400, 'You cannot redeem your own invite code', 'SELF_REDEEM')
    await client.query('update invites set used_by = $2, used_at = now() where id = $1', [invite.id, viewer.id])
  })

  return NextResponse.json({ success: true, data: { redeemed: true } })
})
