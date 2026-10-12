import { SignInForm } from './signin-form'

type Props = { searchParams: Promise<{ verified?: string; verify?: string; reset?: string }> }

// Notices from the email flows: /auth/verify and the password reset redirect here.
export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams
  const notice = params.verified
    ? 'Email confirmed. Sign in to start voting and proposing.'
    : params.reset
      ? 'Password changed. You have been signed out everywhere; sign in with the new password.'
      : null
  const error = params.verify === 'invalid'
    ? 'That confirmation link is invalid or has expired. Sign in and ask for a new one from your dashboard.'
    : null
  return <SignInForm notice={notice} initialError={error} />
}
