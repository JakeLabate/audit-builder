import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function signIn(provider: 'google' | 'github') {
    setBusy(provider)
    setErr(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setErr(error.message)
      setBusy(null)
    }
  }

  return (
    <div className="center">
      <div className="login">
        <h1>AuditBuilder</h1>
        <p>
          Structured SEO audit findings. Every finding is the same forty fields, so the document,
          the register and the roadmap all come from one record.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn pri" onClick={() => signIn('google')} disabled={busy !== null}>
            {busy === 'google' ? 'Redirecting...' : 'Continue with Google'}
          </button>
          <button className="btn" onClick={() => signIn('github')} disabled={busy !== null}>
            {busy === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
          </button>
        </div>
        {err && (
          <div className="issue" style={{ marginTop: 18, textAlign: 'left' }}>
            <b>Sign in failed</b>
            {err}
          </div>
        )}
      </div>
    </div>
  )
}
