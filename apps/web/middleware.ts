import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_TTL_MS, sessionCookie, sessionCookieName } from '@/lib/auth/cookie'

// Edge-safe: this only checks that a session cookie is present. Pages and routes validate the
// session against the database themselves (lib/auth), so a forged cookie gets no further than here.

const PROTECTED_PREFIXES = ['/admin']
const PROTECTED_EXACT = ['/u', '/invites', '/onboarding', '/panels/me']

const isProtected = (pathname: string) =>
  PROTECTED_EXACT.includes(pathname) ||
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))

export const middleware = (request: NextRequest) => {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(sessionCookieName())?.value

  if (isProtected(pathname) && !token) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/auth/signin'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  const response = NextResponse.next()
  // Sliding expiry: keep the cookie as long-lived as the session it carries (the database extends
  // the session on use). Page loads only; route handlers set or clear the cookie themselves.
  if (token && request.method === 'GET' && !pathname.startsWith('/api/')) {
    response.cookies.set(sessionCookie(token, new Date(Date.now() + SESSION_TTL_MS)))
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
