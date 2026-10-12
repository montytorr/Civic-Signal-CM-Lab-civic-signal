// @vitest-environment node
// Account emails go out after the response: the request never waits for the sender, so response
// time does not depend on whether the email has an account. The sender is mocked to never finish.
import { describe, expect, it, vi } from 'vitest'
import * as forgot from '@/api/auth/forgot/route'
import * as resend from '@/api/auth/resend/route'
import * as signup from '@/api/auth/signup/route'
import { call, createUser, hasDatabase, useTestDatabase } from './harness'

const never = () => new Promise<never>(() => undefined)
const email = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))
vi.mock('@/lib/email', () => email)

const within = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms}ms`)), ms))])

describe.skipIf(!hasDatabase)('account emails are not awaited by the request', () => {
  useTestDatabase()

  it('forgot-password answers while the reset email is still sending', async () => {
    email.sendPasswordResetEmail.mockImplementation(never)
    const user = await createUser()
    const res = await within(call(forgot.POST, { method: 'POST', ip: '192.0.2.10', settle: false, body: { email: user.email } }), 2000)
    expect(res.body).toEqual({ success: true })
    expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1)
  })

  it('signup answers while the verification email is still sending', async () => {
    email.sendVerificationEmail.mockImplementation(never)
    const res = await within(
      call(signup.POST, { method: 'POST', ip: '192.0.2.11', settle: false, body: { email: `slow.${Date.now()}@example.com`, password: 'a strong password' } }),
      2000,
    )
    expect(res.body).toEqual({ success: true })
    expect(email.sendVerificationEmail).toHaveBeenCalledTimes(1)
  })

  it('resend answers while the verification email is still sending', async () => {
    email.sendVerificationEmail.mockClear()
    email.sendVerificationEmail.mockImplementation(never)
    const address = `resend-slow.${Date.now()}@example.com`
    await call(signup.POST, { method: 'POST', ip: '192.0.2.12', settle: false, body: { email: address, password: 'a strong password' } })
    const res = await within(call(resend.POST, { method: 'POST', ip: '192.0.2.12', settle: false, body: { email: address } }), 2000)
    expect(res.body).toEqual({ success: true })
    expect(email.sendVerificationEmail).toHaveBeenCalledTimes(2)
  })
})
