import { VerifyForm } from './verify-form'

type Props = { searchParams: Promise<{ token?: string }> }

// The link in the verification email. Opening it changes nothing: confirming needs the password
// (so link scanners cannot use the token, and only a password the mailbox owner chose is confirmed).
export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams
  return <VerifyForm token={token ?? ''} />
}
