import { useCallback, useEffect, useState } from 'react'
import { currentOrg } from '../lib/api'
import {
  ROLE_MEANS, createInvite, listInvites, listMembers, removeMember, revokeInvite, setRole,
  type Invite, type Member,
} from '../lib/team'

/**
 * Who else is in this workspace.
 *
 * There is no mail server, so an invitation produces a link you send yourself.
 * The link is shown once, because the row keeps only a hash of it.
 */
export default function Team() {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setNewRole] = useState('editor')
  const [made, setMade] = useState<{ email: string; link: string; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    try {
      const [m, i] = await Promise.all([listMembers(id), listInvites(id)])
      setMembers(m); setInvites(i); setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const o = await currentOrg()
        if (o) { setOrg(o); void load(o.id) }
      } catch (e) { setErr((e as Error).message) }
    })()
  }, [load])

  const you = members?.find((m) => m.is_you)
  const canManage = you?.role === 'owner' || you?.role === 'editor'

  const invite = async () => {
    if (!org) return
    setBusy(true); setErr(null)
    try {
      const r = await createInvite(org.id, email.trim(), role)
      setMade({ email: r.email, link: r.link, expires_at: r.expires_at })
      setEmail(''); setCopied(false)
      void load(org.id)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true) }
    catch { setErr('Your browser would not let the page copy. Select the link by hand.') }
  }

  const change = async (m: Member, next: string) => {
    if (!org) return
    try { await setRole(org.id, m.user_id, next); void load(org.id) }
    catch (e) { setErr((e as Error).message) }
  }

  const kick = async (m: Member) => {
    if (!org) return
    const who = m.is_you ? 'Leave this workspace?' : `Remove ${m.full_name ?? m.email}?`
    if (!confirm(`${who} They keep nothing: every audit stays with the workspace.`)) return
    try { await removeMember(org.id, m.user_id); void load(org.id) }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>People</h1>
        <p>
          Everyone here sees every brand and every audit in {org?.name ?? 'this workspace'}.
          There is no per-audit permission, on purpose: an audit nobody else can read is a
          document, not a workspace.
        </p>
      </header>

      {err && <div className="issue"><b>Problem</b>{err}</div>}

      {canManage && (
        <section className="doc-s">
          <h2>Invite somebody</h2>
          <p className="doc-p">
            There is no mail server behind this yet, so you get a link and send it yourself.
            It only works for the address you type, so forwarding it gives nothing away.
          </p>
          <div className="keymint">
            <input type="email" value={email} placeholder="them@agency.com"
              onChange={(e) => setEmail(e.target.value)} />
            <select value={role} onChange={(e) => setNewRole(e.target.value)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
            <button className="btn pri" onClick={invite} disabled={busy || !email.trim()}>
              {busy ? 'Creating' : 'Create invitation'}
            </button>
          </div>
          <p className="hint">{ROLE_MEANS[role]}</p>

          {made && (
            <div className="keynew">
              <b>Send this to {made.email}. It is not shown again.</b>
              <div className="keynew-row">
                <code>{made.link}</code>
                <button className="btn sm pri" onClick={() => copy(made.link)}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="hint" style={{ margin: '0 0 8px' }}>
                Expires {new Date(made.expires_at).toLocaleDateString()}.
              </p>
              <button className="btn sm ghost" onClick={() => setMade(null)}>Done, hide it</button>
            </div>
          )}
        </section>
      )}

      <section className="doc-s">
        <h2>In this workspace</h2>
        {!members ? <p className="doc-none">Loading</p> : (
          <div className="keytab-wrap"><table className="keytab">
            <thead><tr><th>Name</th><th>Role</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    {m.full_name ?? m.email ?? 'Unknown'}{m.is_you && <span className="you">you</span>}
                    {m.full_name && m.email && <div className="dim">{m.email}</div>}
                  </td>
                  <td>
                    {canManage && !m.is_you ? (
                      <select value={m.role} onChange={(e) => change(m, e.target.value)}>
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : <span className={'rolechip ' + m.role}>{m.role}</span>}
                  </td>
                  <td className="dim">{new Date(m.joined_at).toLocaleDateString()}</td>
                  <td>
                    {(canManage || m.is_you) && (
                      <button className="btn sm danger" onClick={() => kick(m)}>
                        {m.is_you ? 'Leave' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {invites.length > 0 && (
        <section className="doc-s">
          <h2>Waiting to be accepted</h2>
          <div className="keytab-wrap"><table className="keytab">
            <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td><span className={'rolechip ' + i.role}>{i.role}</span></td>
                  <td className="dim">{new Date(i.expires_at).toLocaleDateString()}</td>
                  <td>{canManage && (
                    <button className="btn sm danger" onClick={async () => {
                      try { await revokeInvite(i.id); if (org) void load(org.id) }
                      catch (e) { setErr((e as Error).message) }
                    }}>Withdraw</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </div>
  )
}
