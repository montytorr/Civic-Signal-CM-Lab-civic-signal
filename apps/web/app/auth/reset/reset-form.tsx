'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthCard, ErrorBox, SubmitButton, inputStyle, labelStyle, linkStyle, postJson } from '../ui'

export const ResetForm = ({ token }: { token: string }) => {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is incomplete. Ask for a new one.')
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
    const resetError = await postJson('/api/auth/reset', { token, password })
    if (resetError) {
      setError(resetError)
      setLoading(false)
      return
    }
    router.push('/auth/signin?reset=1')
    router.refresh()
  }

  return (
    <AuthCard title="Choose a new password" intro="Setting a new password signs you out on every device.">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="password">
            New password
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
            Confirm new password
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

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitButton loading={loading} label="Set new password" loadingLabel="Saving…" />
      </form>

      <p style={{ margin: '22px 0 0', fontSize: 13, color: '#6B7488', textAlign: 'center' }}>
        Link expired?{' '}
        <Link href="/auth/forgot-password" style={linkStyle}>
          Send a new one
        </Link>
      </p>
    </AuthCard>
  )
}
