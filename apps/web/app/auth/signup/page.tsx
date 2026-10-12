'use client'

import { useState } from 'react'
import Link from 'next/link'

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#0E1F36',
  background: '#F5F1E8',
  border: '1px solid #D9D1BD',
  borderRadius: 3,
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 500,
  color: '#3A4861',
}

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not create account')
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 40px 80px' }}>
        <div
          style={{
            maxWidth: 440,
            margin: '40px auto 0',
            background: '#FBF8F1',
            border: '1px solid #D9D1BD',
            borderRadius: 4,
            padding: '36px 40px',
          }}
        >
          <h1
            style={{
              margin: '0 0 6px',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.015em',
              color: '#0E1F36',
            }}
          >
            Create account
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 13.5, color: '#6B7488' }}>
            Join CivicSignal — confirm by email, then start voting or proposing civic questions.
          </p>

          {success ? (
            <div
              style={{
                padding: '20px',
                fontSize: 14,
                color: '#2F6B4A',
                background: 'rgba(47, 107, 74, 0.07)',
                border: '1px solid rgba(47, 107, 74, 0.25)',
                borderRadius: 3,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ display: 'block', marginBottom: 6 }}>Almost there.</strong>
              Check your email for a CivicSignal confirmation link. After confirming, sign in and we’ll take you straight into onboarding.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
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

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle} htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle} htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {error && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#9B3B2E',
                    background: 'rgba(155, 59, 46, 0.07)',
                    border: '1px solid rgba(155, 59, 46, 0.2)',
                    borderRadius: 3,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 38,
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  color: '#FBF8F1',
                  background: loading ? '#3A4861' : '#0E1F36',
                  border: 'none',
                  borderRadius: 3,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {loading ? 'Sending confirmation…' : 'Create account'}
              </button>
            </form>
          )}

          {!success && (
            <p style={{ margin: '22px 0 0', fontSize: 13, color: '#6B7488', textAlign: 'center' }}>
              Already have an account?{' '}
              <Link
                href="/auth/signin"
                style={{ color: '#244B6B', fontWeight: 500 }}
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
