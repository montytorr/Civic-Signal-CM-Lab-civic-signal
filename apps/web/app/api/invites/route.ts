import { randomInt } from 'crypto'
import { NextResponse } from 'next/server'
import { queryOne, withTransaction } from '@civicsignal/db'
import { getRequestViewer } from '@/lib/auth/session'
import { requireUser } from '@/lib/authz'
import { HttpError, mutation, route } from '@/lib/http'
import { getOwnInvites, type InviteListRow } from '@/lib/queries'

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 8
const MAX_ACTIVE_INVITES = 5

const generateCode = () =>
  Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_CHARS[randomInt(INVITE_CODE_CHARS.length)]).join('')

// P14, D9: a user sees only their own invites.
export const GET = route(async (req) => {
  const viewer = requireUser(await getRequestViewer(req))
  return NextResponse.json({ success: true, data: await getOwnInvites(viewer) })
})

// D9: invites are written server-side for the signed-in user, at most five unused at a time.
export const POST = mutation(async (req) => {
  const viewer = requireUser(await getRequestViewer(req))
  const invite = await withTransaction(async (client) => {
    // Serialize a user's invite creation so two requests cannot both pass the limit.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`invites:${viewer.id}`])
    const active = await queryOne<{ n: string }>(
      'select count(*) as n from invites where created_by = $1 and used_by is null',
      [viewer.id],
      client,
    )
    if (Number(active?.n ?? 0) >= MAX_ACTIVE_INVITES) {
      throw new HttpError(400, `Maximum of ${MAX_ACTIVE_INVITES} active invites allowed`, 'MAX_INVITES_REACHED')
    }
    return queryOne<InviteListRow>(
      'insert into invites (code, created_by) values ($1, $2) returning id, code, used_by, used_at, created_at',
      [generateCode(), viewer.id],
      client,
    )
  })
  return NextResponse.json({ success: true, data: invite }, { status: 201 })
})
