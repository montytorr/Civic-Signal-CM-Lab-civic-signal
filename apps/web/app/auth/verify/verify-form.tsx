'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthCard, ErrorBox, SubmitButton, inputStyle, labelStyle, linkStyle, postJson } from '../ui'

export const VerifyForm = ({ token }: { token: string }) => {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(token ? null : 'This confirmation link is incomplete. Sign up again to get a new one.')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const verifyError = await postJson('/api/auth/verify', { token, password })
    if (verifyError) {
      setError(verifyError)
      setLoading(false)
      return
    }
    router.push('/onboarding')
    router.refresh()
  }

  return (
    <AuthCard title="Confirm your email" intro="Enter the password you chose when you signed up. You’ll be signed in and taken to onboarding.">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle} htmlFor="password">
            Password
          </label>
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

        <SubmitButton loading={loading} label="Confirm email" loadingLabel="Confirming…" />
      </form>

      <p style={{ margin: '22px 0 0', fontSize: 13, color: '#6B7488', textAlign: 'center' }}>
        Link expired?{' '}
        <Link href="/auth/signup" style={linkStyle}>
          Sign up again
        </Link>
      </p>
    </AuthCard>
  )
}
