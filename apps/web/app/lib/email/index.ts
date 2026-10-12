// Transactional email through Resend. Without RESEND_API_KEY (dev) the link is logged server-side instead.
import { Resend } from 'resend'

const DEFAULT_FROM = 'CivicSignal <noreply@montytorr.com>'

export type EmailResult = { id?: string; logged?: boolean; error?: string }

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const layout = ({ preview, heading, body, ctaLabel, ctaUrl }: { preview: string; heading: string; body: string; ctaLabel: string; ctaUrl: string }) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(preview)}</title></head>
<body style="margin:0;background:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0E1F36;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
  <main style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6B7488;margin-bottom:18px;">CivicSignal</div>
    <section style="background:#FBF8F1;border:1px solid #D9D1BD;border-radius:6px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-.02em;margin:0 0 14px;color:#0E1F36;">${escapeHtml(heading)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#3A4861;margin:0 0 24px;">${body}</p>
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0E1F36;color:#FBF8F1;text-decoration:none;border-radius:4px;padding:12px 18px;font-size:14px;font-weight:600;">${escapeHtml(ctaLabel)}</a>
      <p style="font-size:12px;line-height:1.5;color:#6B7488;margin:20px 0 0;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(ctaUrl)}</p>
    </section>
    <p style="font-size:12px;line-height:1.5;color:#6B7488;margin:18px 0 0;">Public-good civic infrastructure. No wagering. No tradable tokens. No accounts you can sell.</p>
  </main>
</body></html>`

/**
 * Send one email. Without RESEND_API_KEY it is not sent: in development the link is logged instead
 * so you can follow it; in production nothing secret is logged (links carry single-use tokens).
 */
export const sendEmail = async ({ to, subject, html, link }: { to: string; subject: string; html: string; link: string }): Promise<EmailResult> => {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[email] RESEND_API_KEY is not set; not sending "${subject}".`)
      return { error: 'RESEND_API_KEY is not set' }
    }
    console.info(`[email] RESEND_API_KEY is not set; not sending "${subject}" to ${to}. Link: ${link}`)
    return { logged: true }
  }
  try {
    const result = await new Resend(key).emails.send({ from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM, to, subject, html })
    if (result.error) return { error: result.error.message }
    return { id: result.data?.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}

export const sendVerificationEmail = ({ to, url, handle }: { to: string; url: string; handle: string }): Promise<EmailResult> =>
  sendEmail({
    to,
    subject: 'Confirm your CivicSignal account',
    link: url,
    html: layout({
      preview: 'Confirm your CivicSignal account',
      heading: `Confirm ${handle}`,
      body: 'You are one step away from joining CivicSignal. Confirm your email, then you can vote on active civic polls, propose new questions, and build non-transferable topic reputation. The link works once, for 24 hours.',
      ctaLabel: 'Confirm account',
      ctaUrl: url,
    }),
  })

export const sendPasswordResetEmail = ({ to, url }: { to: string; url: string }): Promise<EmailResult> =>
  sendEmail({
    to,
    subject: 'Reset your CivicSignal password',
    link: url,
    html: layout({
      preview: 'Reset your CivicSignal password',
      heading: 'Reset your password',
      body: 'Someone asked to reset the password of the CivicSignal account for this email. If it was you, choose a new password below; the link works once, for one hour, and signs you out everywhere. If it was not you, ignore this email.',
      ctaLabel: 'Choose a new password',
      ctaUrl: url,
    }),
  })
