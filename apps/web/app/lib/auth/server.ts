// The current session for server components and server actions (reads the cookie via next/headers).
// Route handlers use getRequestSession(req) from ./session instead.
import { cache } from 'react'
import { cookies } from 'next/headers'
import { sessionCookieName } from './cookie'
import { validateSessionToken, type AuthSession, type AuthUser } from './session'

/** The session for this request, or null. Deduplicated per render. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const store = await cookies()
  return validateSessionToken(store.get(sessionCookieName())?.value)
})

/** The signed-in user for this request, or null. */
export const getViewer = async (): Promise<AuthUser | null> => (await getSession())?.user ?? null
