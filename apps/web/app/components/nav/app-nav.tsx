'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { CsWordmark } from '@civicsignal/ui'

const PRIMARY_TABS = [
  { label: 'Polls', href: '/polls' },
  { label: 'Proposals', href: '/proposals' },
  { label: 'Methodology', href: '/methodology' },
]

const SECONDARY_TABS = [
  { label: 'Demo', href: '/demo' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'Panels', href: '/panels' },
  { label: 'Archive', href: '/archive' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Public audit', href: '/verify' },
  { label: 'Reports', href: '/reports' },
]

/** The signed-in user as the root layout reads it from the session on the server. */
export type NavViewer = { handle: string; isAdmin: boolean } | null

export const AppNav = ({ viewer }: { viewer: NavViewer }) => {
  const router = useRouter()
  const pathname = usePathname()
  const handle = viewer?.handle || null
  const isAdmin = viewer?.isAdmin ?? false

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.push('/')
    router.refresh()
  }

  const accountTabs = [
    ...(viewer ? [{ label: 'Start', href: '/onboarding' }, { label: 'Profile', href: handle ? `/u/${handle}` : '/u' }] : []),
    ...(isAdmin ? [{ label: 'Admin', href: '/admin' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/archive') return pathname === '/archive' || pathname.endsWith('/resolved')
    if (href === '/polls') return pathname === '/polls' || (pathname.startsWith('/polls/') && !pathname.endsWith('/resolved'))
    if (href.startsWith('/u/')) return pathname.startsWith('/u/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const secondaryActive = SECONDARY_TABS.some((tab) => isActive(tab.href))
  const initials = handle ? handle.split('-').slice(0, 2).map((s) => s[0]).join('') : null

  const navLinkStyle = (active: boolean) => ({
    padding: '7px 13px 8px',
    fontSize: 13.5,
    fontWeight: active ? 600 : 450,
    color: active
      ? 'var(--color-parchment-ink)'
      : 'var(--color-parchment-ink-soft)',
    background: active ? 'var(--color-parchment-surface)' : 'transparent',
    border: active ? '1px solid var(--color-parchment-line-soft)' : '1px solid transparent',
    borderRadius: 3,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <nav
      className="cs-nav-pad w-full flex items-center justify-between border-b border-parchment-line"
      style={{ padding: '22px 56px' }}
    >
      <Link href="/" className="shrink-0">
        <CsWordmark size={18} />
      </Link>

      <div className="cs-nav-tabs flex items-center" style={{ gap: 4 }}>
        {PRIMARY_TABS.map(({ label, href }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="relative transition-colors rounded-[3px]"
              aria-current={active ? 'page' : undefined}
              style={navLinkStyle(active)}
            >
              {label}
            </Link>
          )
        })}

        <details style={{ position: 'relative' }}>
          <summary
            className="relative transition-colors rounded-[3px]"
            style={{
              ...navLinkStyle(secondaryActive),
              listStyle: 'none',
              cursor: 'pointer',
            }}
          >
            More
          </summary>
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 30,
              minWidth: 176,
              padding: 6,
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              boxShadow: '0 18px 38px rgba(14, 31, 54, 0.12)',
            }}
          >
            {SECONDARY_TABS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  borderRadius: 3,
                  color: isActive(href) ? 'var(--color-parchment-ink)' : 'var(--color-parchment-ink-soft)',
                  background: isActive(href) ? 'var(--color-parchment-bg)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </details>

        {accountTabs.map(({ label, href }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="relative transition-colors rounded-[3px]"
              aria-current={active ? 'page' : undefined}
              style={navLinkStyle(active)}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {viewer && handle ? (
          <>
            <span
              className="cs-hide-mobile font-mono text-parchment-muted tracking-[0.04em]"
              style={{ fontSize: 11 }}
            >
              {handle}
            </span>
            <div className="w-7 h-7 rounded-full bg-parchment-surface-alt border border-parchment-line flex items-center justify-center shrink-0">
              <span className="font-mono text-[10px] font-medium text-parchment-ink-soft tracking-[0.03em]">
                {initials}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="cs-hide-mobile"
              style={{
                fontSize: 12,
                color: 'var(--color-parchment-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                fontFamily: 'inherit',
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/auth/signin"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-parchment-ink-soft)',
              padding: '6px 12px',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 3,
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
