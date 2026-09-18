import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Sign in. Four routes into the same account: three OAuth providers and a
 * one time email link.
 *
 * Google sits first because it is the provider most people here already have,
 * not because the app needs it. The Sheets export asks Google for a drive.file
 * token of its own at export time, so a GitHub or Microsoft or email account
 * exports to Sheets exactly as well as a Google one does.
 */

type Provider = 'google' | 'github' | 'azure'

const PROVIDERS: { id: Provider; label: string; icon: JSX.Element }[] = [
  {
    id: 'google',
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
        <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6Z" />
        <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4Z" />
        <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6Z" />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    ),
  },
  {
    id: 'azure',
    label: 'Continue with Microsoft',
    icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path fill="#F25022" d="M0 0h7.6v7.6H0z" />
        <path fill="#7FBA00" d="M8.4 0H16v7.6H8.4z" />
        <path fill="#00A4EF" d="M0 8.4h7.6V16H0z" />
        <path fill="#FFB900" d="M8.4 8.4H16V16H8.4z" />
      </svg>
    ),
  },
]

const RESEND_SECONDS = 45

export default function Login() {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function signIn(provider: Provider) {
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

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy('email')
    setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setBusy(null)
    if (error) {
      setErr(error.message)
      return
    }
    setSentTo(address)
    setCooldown(RESEND_SECONDS)
  }

  if (sentTo) {
    return (
      <div className="center">
        <div className="login">
          <h1>Check your email</h1>
          <p>
            A sign in link is on its way to <b className="sent-addr">{sentTo}</b>. It works once and
            expires in an hour. You can close this tab, the link opens a new one.
          </p>
          <div className="login-acts">
            <button
              className="btn"
              disabled={cooldown > 0 || busy !== null}
              onClick={(e) => sendLink(e as unknown as React.FormEvent)}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another link'}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setSentTo(null)
                setErr(null)
                setTimeout(() => emailRef.current?.focus(), 0)
              }}
            >
              Use a different address
            </button>
          </div>
          {err && (
            <div className="issue login-err">
              <b>Could not send</b>
              {err}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <div className="login">
        <h1>AuditBuilder</h1>
        <p>
          Structured SEO audit findings. Every finding is the same forty fields, so the document,
          the register and the roadmap all come from one record.
        </p>

        <div className="login-oauth">
          {PROVIDERS.map((p, i) => (
            <button
              key={p.id}
              className={i === 0 ? 'btn pri wide' : 'btn wide'}
              onClick={() => signIn(p.id)}
              disabled={busy !== null}
            >
              {p.icon}
              <span>{busy === p.id ? 'Redirecting...' : p.label}</span>
            </button>
          ))}
        </div>

        <div className="or"><span>or</span></div>

        <form className="login-email" onSubmit={sendLink}>
          <label htmlFor="email">Email me a one time link</label>
          <div className="login-email-row">
            <input
              id="email"
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy !== null}
            />
            <button className="btn" type="submit" disabled={busy !== null || !email.trim()}>
              {busy === 'email' ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="login-fine">No password to set, and none to forget.</p>
        </form>

        {err && (
          <div className="issue login-err">
            <b>Sign in failed</b>
            {err}
          </div>
        )}
      </div>
    </div>
  )
}
