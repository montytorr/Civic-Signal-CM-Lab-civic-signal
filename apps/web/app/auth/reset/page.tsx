import { ResetForm } from './reset-form'

type Props = { searchParams: Promise<{ token?: string }> }

// The link in the password reset email. The token is checked when the form is submitted.
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams
  return <ResetForm token={token ?? ''} />
}
