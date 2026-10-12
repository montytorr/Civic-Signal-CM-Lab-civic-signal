'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthCard, ErrorBox, NoticeBox, SubmitButton, inputStyle, labelStyle, linkStyle, postJson } from '../ui'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const requestError = await postJson('/api/auth/forgot', { email })
    setLoading(false)
    if (requestError) {
      setError(requestError)
      return
    }
    setSent(true)
  }

  return (
    <AuthCard title="Reset your password" intro="Enter the email you signed up with and we’ll send you a link to choose a new password.">
      {sent ? (
        <NoticeBox>
          <strong style={{ display: 'block', marginBottom: 6 }}>Check your email.</strong>
          If an account exists for {email}, a reset link is on its way. It works once, for one hour.
        </NoticeBox>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <SubmitButton loading={loading} label="Send reset link" loadingLabel="Sending…" />
        </form>
      )}

      <p style={{ margin: '22px 0 0', fontSize: 13, color: '#6B7488', textAlign: 'center' }}>
        Remembered it?{' '}
        <Link href="/auth/signin" style={linkStyle}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
