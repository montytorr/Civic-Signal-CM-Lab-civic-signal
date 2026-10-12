// The session cookie. Edge-safe (no Node APIs): middleware.ts imports from here.

/** Sessions live 30 days from their last use (sliding expiry). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionCookie {
  name: string
  value: string
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  expires: Date
}

const isProduction = () => process.env.NODE_ENV === 'production'

/**
 * The cookie name: `__Host-cs_session` in production, where the cookie is Secure (the prefix makes
 * browsers refuse it unless it is Secure, Path=/ and host-only, so a sibling subdomain cannot set
 * or shadow it), and `cs_session` in development over plain http.
 */
export const sessionCookieName = (): string => (isProduction() ? '__Host-cs_session' : 'cs_session')

/** httpOnly, SameSite=Lax, Secure in production. The value is the raw token; the DB has its hash. */
export const sessionCookie = (token: string, expiresAt: Date): SessionCookie => ({
  name: sessionCookieName(),
  value: token,
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'lax',
  path: '/',
  expires: expiresAt,
})

/** The same cookie, expired: clears it in the browser. */
export const clearedSessionCookie = (): SessionCookie => sessionCookie('', new Date(0))

/** Read the session token from a Cookie request header. */
export const readSessionToken = (cookieHeader: string | null | undefined): string | null => {
  if (!cookieHeader) return null
  const name = sessionCookieName()
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    const value = part.slice(eq + 1).trim()
    return value || null
  }
  return null
}
