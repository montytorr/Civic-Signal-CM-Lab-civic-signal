// Rate limits for the account routes, in one place. In-memory and per process (lib/rate-limit).
import { AUTH_WINDOW_MS, enforceRateLimit, reserveAttempts } from '@/lib/rate-limit'

const HOUR_MS = 60 * 60 * 1000
const TOO_MANY_AUTH = 'Too many authentication attempts. Try again later.'

/** All login attempts from one IP (password spraying across accounts). */
export const LOGIN_ATTEMPTS_PER_IP = 30
/** Wrong passwords for one email from one IP (guessing one account). */
export const PASSWORD_FAILURES_PER_EMAIL_IP = 10
/**
 * Wrong passwords for one email from anywhere. High on purpose: it only exists to bound a
 * distributed guess, and it is also how far a stranger can lock an account out. With the per
 * email+IP cap, locking someone out takes at least 10 attacker IPs for 15 minutes (the residual
 * risk), while the owner's own IP keeps its own budget until then.
 */
export const PASSWORD_FAILURES_PER_EMAIL = 100

/** Count a login attempt against the IP; 429 past the cap. */
export const limitLoginAttempt = (ip: string) => enforceRateLimit(`login:${ip}`, LOGIN_ATTEMPTS_PER_IP, AUTH_WINDOW_MS, TOO_MANY_AUTH)

/**
 * Reserve a password-failure slot for an email (per email+IP and per email) before checking a
 * password, atomically. Call the returned function when the password was right (or never checked):
 * only wrong passwords stay counted. Login and email verification share these counters, so a
 * verification link cannot be used to guess more passwords than the login form allows.
 */
export const reservePasswordAttempt = (email: string, ip: string) =>
  reserveAttempts(
    [
      [`password-fail:${email}:${ip}`, PASSWORD_FAILURES_PER_EMAIL_IP, AUTH_WINDOW_MS],
      [`password-fail:${email}`, PASSWORD_FAILURES_PER_EMAIL, AUTH_WINDOW_MS],
    ],
    TOO_MANY_AUTH,
  )

/**
 * Limits for routes that send an account email (signup, resend, forgot): per IP, per email+IP, and
 * a looser hourly cap per email. Keying on email+IP means an attacker spending a victim's budget
 * from their own IP does not stop the victim from their IP. Each flow has its own budgets, so
 * exhausting signup and resend for an email leaves password reset (the owner's way back in)
 * untouched. Residual: an attacker with at least 4 IPs can spend one flow's hourly budget for an
 * email (4 x 5 per 15 minutes = 20), blocking that flow for the owner until the hour passes.
 */
export const limitEmailFlow = (flow: 'signup' | 'resend' | 'forgot', email: string, ip: string) => {
  enforceRateLimit(`${flow}:${email}:${ip}`, 5, AUTH_WINDOW_MS)
  enforceRateLimit(`${flow}:${email}`, 20, HOUR_MS)
}

/** Per-IP cap on a route that sends account email or consumes a token; one key per route. */
export const limitIp = (flow: 'signup' | 'resend' | 'forgot' | 'reset' | 'verify', ip: string, max = 10) =>
  enforceRateLimit(`ip:${flow}:${ip}`, max, AUTH_WINDOW_MS)
