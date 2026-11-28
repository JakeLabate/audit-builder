import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { myWorkspaces, saveConnection, type Workspace } from '../lib/mcp'

/**
 * The page an MCP client sends someone to when it asks to connect.
 *
 * Supabase's OAuth server checks the request and forwards here with an
 * authorization_id. The person is already signed in to the app (App routes
 * them through the sign in first and back again), so this page only has to
 * say who is asking and for what, take a workspace, and pass the answer back.
 */

interface Details {
  authorization_id: string
  redirect_uri: string
  scope: string
  client: { id: string; name: string; uri: string; logo_uri: string }
  user: { id: string; email: string }
}

export default function OAuthConsent({ session }: { session: Session }) {
  const id = new URLSearchParams(location.search).get('authorization_id')
  const [details, setDetails] = useState<Details | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [org, setOrg] = useState('')
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setErr('This link is missing its authorization id. Start the connection again from your MCP client.'); return }
    ;(async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (error) { setErr(error.message); return }
      // Already approved before: Supabase hands back where to go next.
      if (data && !('authorization_id' in data)) { location.assign(data.redirect_url); return }
      setDetails(data as Details)
      try {
        const ws = await myWorkspaces()
        setWorkspaces(ws)
        setOrg(ws[0]?.id ?? '')
      } catch (e) { setErr((e as Error).message) }
    })()
  }, [id])

  const allow = async () => {
    if (!details || !org) return
    setBusy('allow'); setErr(null)
    try {
      await saveConnection(session.user.id, details.client.id, org, details.client.name)
      const { data, error } = await supabase.auth.oauth.approveAuthorization(details.authorization_id,
        { skipBrowserRedirect: true })
      if (error) throw error
      location.assign(data.redirect_url)
    } catch (e) { setErr((e as Error).message); setBusy(null) }
  }

  const deny = async () => {
    if (!details) return
    setBusy('deny'); setErr(null)
    const { data, error } = await supabase.auth.oauth.denyAuthorization(details.authorization_id,
      { skipBrowserRedirect: true })
    if (error) { setErr(error.message); setBusy(null); return }
    location.assign(data.redirect_url)
  }

  const back = (() => {
    try { return details ? new URL(details.redirect_uri).host : '' } catch { return '' }
  })()
  const name = details?.client.name || 'An MCP client'
  const ws = workspaces.find((w) => w.id === org)

  return (
    <div className="center">
      <div className="login consent">
        <div className="consent-mark">AuditBuilder</div>
        {!details && !err && <p className="consent-wait">Checking the request</p>}
        {err && (
          <div className="issue login-err"><b>This connection cannot continue</b>{err}</div>
        )}
        {details && (
          <>
            {details.client.logo_uri && <img className="consent-logo" src={details.client.logo_uri} alt="" />}
            <h1>Connect {name}?</h1>
            <p>
              {name} wants to use AuditBuilder as <b>{details.user.email || session.user.email}</b>.
            </p>

            {workspaces.length > 1 ? (
              <div className="consent-ws">
                <label htmlFor="consent-ws">Workspace it can use</label>
                <select id="consent-ws" value={org} onChange={(e) => setOrg(e.target.value)}>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            ) : ws ? (
              <div className="consent-ws one"><span>Workspace</span><b>{ws.name}</b></div>
            ) : null}

            <ul className="consent-can">
              <li>Read your brands, audits, findings and exhibits</li>
              <li>Create and change them, with the same rules the app applies</li>
              <li>Export audits as JSON, CSV or Markdown</li>
            </ul>
            <p className="consent-note">
              It acts as you, with your access and nothing more. It cannot see other workspaces.
              Disconnect it any time from the MCP page.
            </p>

            <div className="consent-acts">
              <button className="btn" onClick={deny} disabled={busy !== null}>
                {busy === 'deny' ? 'Cancelling' : 'Cancel'}
              </button>
              <button className="btn pri" onClick={allow} disabled={busy !== null || !org}>
                {busy === 'allow' ? 'Connecting' : 'Allow'}
              </button>
            </div>
            {back && <p className="consent-back">You will be sent back to {back}.</p>}
          </>
        )}
      </div>
    </div>
  )
}
