'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthCard, ErrorBox, NoticeBox, SubmitButton, inputStyle, labelStyle, linkStyle, postJson } from '../ui'

export const SignInForm = ({ notice, initialError }: { notice: string | null; initialError: string | null }) => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const authError = await postJson('/api/auth/login', { email, password })
    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    router.push('/onboarding')
    router.refresh()
  }

  return (
    <AuthCard title="Sign in" intro="Welcome back. We’ll take you to your next useful action.">
      {notice && <NoticeBox>{notice}</NoticeBox>}

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

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label style={labelStyle} htmlFor="password">
              Password
            </label>
            <Link href="/auth/forgot-password" style={{ ...linkStyle, fontSize: 12 }}>
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitButton loading={loading} label="Sign in" loadingLabel="Signing in…" />
      </form>

      <p style={{ margin: '22px 0 0', fontSize: 13, color: '#6B7488', textAlign: 'center' }}>
        No account yet?{' '}
        <Link href="/auth/signup" style={linkStyle}>
          Create one
        </Link>
      </p>
    </AuthCard>
  )
}
