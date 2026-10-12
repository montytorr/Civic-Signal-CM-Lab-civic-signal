// Route handler plumbing: typed errors, JSON bodies, the CSRF Origin check and APP_URL.
import { NextResponse } from 'next/server'

/** An error a route handler turns into a JSON response with this status and code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message)
  }
}

export const jsonError = (status: number, error: string, code?: string, headers?: Record<string, string>) =>
  NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status, headers })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a UUID string. Ids from URLs are checked first, so a malformed one is a 404, not a 500. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/**
 * The public base URL (APP_URL), without a trailing slash, or null when unset in development.
 * Production refuses to run without it: links in emails and the Origin check depend on it.
 */
export const appUrl = (): string | null => {
  const raw = process.env.APP_URL?.trim()
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL is not set. Set it to the public origin, e.g. https://civicsignal.montytorr.com')
    }
    return null
  }
  return new URL(raw).origin
}

/** Base URL for links in emails: APP_URL, else (development only) the origin the request came in on. */
export const baseUrlFor = (req: Request): string => appUrl() ?? new URL(req.url).origin

/**
 * The client IP for rate limiting. In production the app sits behind Traefik 3
 * (trading-bot-v2-traefik), whose entry points trust no forwarded headers: it drops the client's
 * own X-Forwarded-For, writes the TCP peer there, and sets X-Real-Ip to the TCP peer. So X-Real-Ip
 * is the trustworthy value. Without it, use the LAST X-Forwarded-For entry (the one the nearest
 * proxy appended); the first entry is whatever the client sent and would let it dodge per-IP limits.
 *
 * Residual, accepted: checked on clawdius, Traefik v3.7.13 with no forwardedHeaders.trustedIPs or
 * forwardedHeaders.insecure on its entry points. But the container's port 3000 is reachable from
 * other containers on trading-v2-network without Traefik, and a request sent that way can set any
 * X-Real-Ip and so pick its own rate-limit bucket. Only code already running on that network can
 * do this.
 */
export const clientIp = (req: Request): string => {
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return forwarded?.at(-1) || 'unknown'
}

const requestOrigin = (req: Request): string | null => {
  const origin = req.headers.get('origin')
  if (origin && origin !== 'null') return origin
  const referer = req.headers.get('referer')
  if (!referer) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

/**
 * CSRF defence on top of SameSite=Lax: a mutating request must come from our own origin
 * (APP_URL, or the request's own origin when APP_URL is unset in dev). Browsers send Origin on
 * every cross-origin and same-origin POST/PATCH/PUT/DELETE; a request without one is refused.
 */
export const assertSameOrigin = (req: Request) => {
  const expected = appUrl() ?? new URL(req.url).origin
  const actual = requestOrigin(req)
  if (actual !== expected) throw new HttpError(403, 'Cross-origin request refused', 'BAD_ORIGIN')
}

/** Parse a JSON object body, or throw a 400. */
export const readJson = async (req: Request): Promise<Record<string, unknown>> => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new HttpError(400, 'Request body must be JSON', 'INVALID_BODY')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object', 'INVALID_BODY')
  }
  return body as Record<string, unknown>
}

const toResponse = (err: unknown): Response => {
  if (err instanceof HttpError) return jsonError(err.status, err.message, err.code, err.headers)
  // Log the message and code only: driver errors can carry parameter values in `detail`.
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: unknown } | null)?.code
  console.error('[api] unhandled error:', message, typeof code === 'string' ? code : '')
  return jsonError(500, 'Internal server error')
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>

/** Wrap a read-only route handler: HttpError becomes its JSON response, anything else a 500. */
export const route = <C>(handler: Handler<C>): Handler<C> => async (req, ctx) => {
  try {
    return await handler(req, ctx)
  } catch (err) {
    return toResponse(err)
  }
}

/** Wrap a mutating route handler (POST, PATCH, PUT, DELETE): also checks Origin first. */
export const mutation = <C>(handler: Handler<C>): Handler<C> =>
  route(async (req, ctx) => {
    assertSameOrigin(req)
    return handler(req, ctx)
  })
