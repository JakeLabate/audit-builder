import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { currentOrg } from '../lib/api'
import { API_BASE, MCP_URL, fetchApiIndex, type ApiIndex } from '../lib/apibase'
import { createKey, listKeys, revokeKey, type ApiKeyRow, type MintedKey } from '../lib/keys'
import { disconnect, listConnections, type Connection } from '../lib/mcp'

/**
 * MCP, and further down the REST API.
 *
 * MCP comes first because it is what most people connect: an assistant, signed
 * in as them. The REST API is for scripts, and keeps keys.
 *
 * The tool and route lists are fetched from the worker rather than written
 * here. Documentation kept by hand beside the thing it documents always ends
 * up describing a version that no longer exists.
 */
export default function McpPage() {
  const loc = useLocation()
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [idx, setIdx] = useState<ApiIndex | null>(null)
  const [idxErr, setIdxErr] = useState<string | null>(null)
  const [conns, setConns] = useState<Connection[] | null>(null)
  const [connErr, setConnErr] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null)
  const [minted, setMinted] = useState<MintedKey | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadKeys = useCallback(async (orgId: string) => {
    try { setKeys(await listKeys(orgId)) } catch (e) { setErr((e as Error).message) }
  }, [])
  const loadConns = useCallback(async () => {
    try { setConns(await listConnections()); setConnErr(null) }
    catch (e) { setConns([]); setConnErr((e as Error).message) }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const o = await currentOrg()
        if (o) { setOrg(o); void loadKeys(o.id) }
      } catch (e) { setErr((e as Error).message) }
      void loadConns()
      try { setIdx(await fetchApiIndex()) } catch (e) { setIdxErr((e as Error).message) }
    })()
  }, [loadKeys, loadConns])

  // The old /api links land here with #api, which a client side navigation
  // does not scroll to by itself.
  useEffect(() => {
    if (loc.hash !== '#api') return
    const t = setTimeout(() => document.getElementById('api')?.scrollIntoView({ behavior: 'smooth' }), 250)
    return () => clearTimeout(t)
  }, [loc.hash])

  const copy = async (k: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(k)
      setTimeout(() => setCopied((c) => (c === k ? null : c)), 1600)
    } catch { setErr('Your browser would not let the page copy. Select it by hand.') }
  }

  const mint = async () => {
    if (!org) return
    setBusy(true); setErr(null)
    try {
      const k = await createKey(org.id, name.trim() || 'Untitled key', ['read', 'write'])
      setMinted(k); setName('')
      void loadKeys(org.id)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const kill = async (k: ApiKeyRow) => {
    if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return
    try { await revokeKey(k.id); if (org) void loadKeys(org.id) }
    catch (e) { setErr((e as Error).message) }
  }

  const drop = async (c: Connection) => {
    if (!confirm(`Disconnect ${c.name}? It stops working now, and has to sign in again to come back.`)) return
    try { await disconnect(c.clientId); void loadConns() }
    catch (e) { setErr((e as Error).message) }
  }

  const live = useMemo(() => (keys ?? []).filter((k) => !k.revoked_at), [keys])
  const dead = useMemo(() => (keys ?? []).filter((k) => k.revoked_at), [keys])

  const claudeCode = `claude mcp add --transport http auditbuilder ${MCP_URL}`
  const curl = `curl -H "Authorization: Bearer YOUR_KEY" \\
  ${API_BASE}/v1/audits`

  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>MCP</h1>
        <p>
          Connect Claude, or any client that speaks MCP, to your workspace. It signs in with your
          AuditBuilder account, the same way you sign in here, so there is no key to create, paste
          or leak, and it can do exactly what you can and nothing more.
        </p>
      </header>

      {err && <div className="issue"><b>Problem</b>{err}</div>}

      {/* ------------------------------------------------------- connect */}
      <section className="doc-s">
        <h2>Connect</h2>
        <Snippet id="mcp" text={MCP_URL} copied={copied} onCopy={copy} label="Server URL" />

        <h3 className="doc-h3">Claude, on the web or the desktop app</h3>
        <ol className="doc-ol">
          <li>Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>.</li>
          <li>Name it AuditBuilder and paste the server URL above. Leave the advanced settings empty.</li>
          <li>Press <b>Connect</b>. A page opens: sign in, check the workspace, and press <b>Allow</b>.</li>
        </ol>

        <h3 className="doc-h3">Claude Code</h3>
        <Snippet id="cc" text={claudeCode} copied={copied} onCopy={copy} label="Add it" block />
        <p className="doc-p">Then run <code>/mcp</code> inside Claude Code and choose AuditBuilder to sign in.</p>

        <h3 className="doc-h3">Anything else</h3>
        <p className="doc-p">
          Any client that supports MCP authorization works the same way: give it the URL and no
          Authorization header. It finds the sign in page by itself, through the standard OAuth
          2.1 discovery documents, and registers itself the first time it connects.
        </p>
      </section>

      {/* --------------------------------------------------- connections */}
      <section className="doc-s">
        <h2>Connected</h2>
        <p className="doc-p">
          Each client you allow appears here, with the workspace it acts in. Disconnecting one
          stops it at once, and it has to ask again to come back.
        </p>
        {conns === null && <p className="doc-none">Loading</p>}
        {conns && conns.length === 0 && (
          <p className="doc-none">{connErr ? 'Connections could not be listed right now.' : 'Nothing connected yet.'}</p>
        )}
        {conns && conns.length > 0 && (
          <div className="keytab-wrap"><table className="keytab">
            <thead><tr><th>Client</th><th>Workspace</th><th>Connected</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {conns.map((c) => (
                <tr key={c.clientId}>
                  <td><span className="conn-name">{c.logo && <img src={c.logo} alt="" />}{c.name}</span></td>
                  <td>{c.workspace ?? <span className="dim">your workspace</span>}</td>
                  <td className="dim">{new Date(c.grantedAt).toLocaleDateString()}</td>
                  <td className="dim">{c.lastUsed ? new Date(c.lastUsed).toLocaleDateString() : 'never'}</td>
                  <td><button className="btn sm danger" onClick={() => drop(c)}>Disconnect</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {/* --------------------------------------------------------- tools */}
      <section className="doc-s">
        <h2>Tools{idx?.tools ? `, ${idx.tools.length} of them` : ''}</h2>
        <p className="doc-p">
          Call <code>get_field_schema</code> first. It returns every field on the record, its type,
          and who is meant to supply it. In a logic audit the database generates and constrains a
          good half of them, and rejects a write that contradicts what it derives, with a sentence
          saying why, so guessing at the shape wastes a round trip.
        </p>
        {idxErr && (
          <div className="issue">
            <b>The server did not answer</b>
            The tools could not be read from it, so nothing is listed rather than something possibly
            wrong. {idxErr}
          </div>
        )}
        {idx?.tools && (
          <dl className="toollist">
            {idx.tools.map((t) => (
              <div key={t.name}>
                <dt><code>{t.name}</code></dt>
                <dd>{t.description}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ---------------------------------------------------------- REST */}
      <section className="doc-s doc-api" id="api">
        <h2>REST API</h2>
        <p className="doc-p">
          For scripts and integrations that are not an MCP client. The same handlers sit behind
          both, so a REST call and a tool call reach identical code. The API signs in with a key
          instead of a person.
        </p>

        <h3 className="doc-h3">Keys</h3>
        <p className="doc-p">
          A key belongs to a workspace{org ? ` (${org.name})` : ''}, not to you, and can read and
          write everything in it. The key is shown once, here, and never stored: only its hash is
          kept, so a leaked database does not leak working keys.
        </p>
        <div className="keymint">
          <input value={name} placeholder="What is it for? e.g. Nightly sync"
            onChange={(e) => setName(e.target.value)} />
          <button className="btn pri" onClick={mint} disabled={busy || !org}>
            {busy ? 'Creating' : 'Create key'}
          </button>
        </div>

        {minted && (
          <div className="keynew">
            <b>Copy this now. It will not be shown again.</b>
            <div className="keynew-row">
              <code>{minted.key}</code>
              <button className="btn sm pri" onClick={() => copy('new', minted.key)}>
                {copied === 'new' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button className="btn sm ghost" onClick={() => setMinted(null)}>Done, hide it</button>
          </div>
        )}

        {keys && (live.length > 0 || dead.length > 0) && (
          <div className="keytab-wrap"><table className="keytab">
            <thead><tr><th>Name</th><th>Prefix</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {live.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td><code>{k.prefix}…</code></td>
                  <td className="dim">{k.last_used_at
                    ? new Date(k.last_used_at).toLocaleDateString() : 'never'}</td>
                  <td><button className="btn sm danger" onClick={() => kill(k)}>Revoke</button></td>
                </tr>
              ))}
              {dead.map((k) => (
                <tr key={k.id} className="off">
                  <td>{k.name}</td>
                  <td><code>{k.prefix}…</code></td>
                  <td className="dim">revoked {new Date(k.revoked_at!).toLocaleDateString()}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {keys && keys.length === 0 && <p className="doc-none">No keys yet.</p>}

        <h3 className="doc-h3">Call it</h3>
        <Snippet id="curl" text={curl} copied={copied} onCopy={copy} label="Try it" block />
        {idx && (
          <ul className="routelist">
            {idx.routes.map((r) => {
              const [m, ...rest] = r.split(/\s+/)
              return (
                <li key={r}>
                  <span className={'verb ' + m.toLowerCase()}>{m}</span>
                  <code>{rest.join(' ')}</code>
                </li>
              )
            })}
          </ul>
        )}
        <p className="doc-p">
          <code>GET /v1/schema</code> is the REST twin of <code>get_field_schema</code>.
        </p>
      </section>
    </div>
  )
}

function Snippet({ id, text, label, copied, onCopy, block }: {
  id: string; text: string; label: string
  copied: string | null; onCopy: (k: string, t: string) => void; block?: boolean
}) {
  return (
    <div className={'snip' + (block ? ' block' : '')}>
      <div className="snip-l">{label}</div>
      <pre><code>{text}</code></pre>
      <button className="btn sm" onClick={() => onCopy(id, text)}>
        {copied === id ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
