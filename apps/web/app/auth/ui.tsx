// Shared pieces of the auth pages (sign in, forgot password, reset password), in the sign-in style.

export const inputStyle: React.CSSProperties = {
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

export const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 500,
  color: '#3A4861',
}

export const linkStyle: React.CSSProperties = { color: '#244B6B', fontWeight: 500 }

export const AuthCard = ({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) => (
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
          {title}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 13.5, color: '#6B7488' }}>{intro}</p>
        {children}
      </div>
    </main>
  </div>
)

export const ErrorBox = ({ children }: { children: React.ReactNode }) => (
  <div
    role="alert"
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
    {children}
  </div>
)

export const NoticeBox = ({ children }: { children: React.ReactNode }) => (
  <div
    role="status"
    style={{
      marginBottom: 16,
      padding: '12px 14px',
      fontSize: 13.5,
      color: '#2F6B4A',
      background: 'rgba(47, 107, 74, 0.07)',
      border: '1px solid rgba(47, 107, 74, 0.25)',
      borderRadius: 3,
      lineHeight: 1.5,
    }}
  >
    {children}
  </div>
)

export const SubmitButton = ({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) => (
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
    {loading ? loadingLabel : label}
  </button>
)

/** POST JSON to an auth route; returns the error message, or null on success. */
export const postJson = async (url: string, body: unknown): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
    return res.ok && data.success ? null : data.error ?? 'Something went wrong. Try again.'
  } catch {
    return 'Network error — please try again'
  }
}
