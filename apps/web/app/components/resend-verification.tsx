'use client'

import { useState } from 'react'

// Re-sends the verification email to the signed-in user (POST /api/auth/resend).
export const ResendVerification = () => {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const resend = async () => {
    setState('sending')
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-parchment-muted)' }}>
      {state === 'sent' ? (
        'Sent. Check your inbox for a new confirmation link.'
      ) : (
        <>
          No confirmation email?{' '}
          <button
            type="button"
            onClick={resend}
            disabled={state === 'sending'}
            style={{
              padding: 0,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'inherit',
              color: '#244B6B',
              background: 'transparent',
              border: 'none',
              textDecoration: 'underline',
              cursor: state === 'sending' ? 'not-allowed' : 'pointer',
            }}
          >
            {state === 'sending' ? 'Sending…' : 'Send it again'}
          </button>
          {state === 'error' && ' — that did not work; try again in a few minutes.'}
        </>
      )}
    </p>
  )
}
