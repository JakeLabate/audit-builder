import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentOrg } from '../lib/api'
import { API_BASE, MCP_URL, fetchApiIndex, type ApiIndex } from '../lib/apibase'
import { createKey, listKeys, revokeKey, type ApiKeyRow, type MintedKey } from '../lib/keys'

/**
 * API and MCP.
 *
 * The route and tool lists are fetched from the worker rather than written
 * here. Documentation kept by hand beside the thing it documents always ends
 * up describing a version that no longer exists.
 */
export default function ApiPage() {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [idx, setIdx] = useState<ApiIndex | null>(null)
  const [idxErr, setIdxErr] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null)
  const [minted, setMinted] = useState<MintedKey | null>(null)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['read', 'write'])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadKeys = useCallback(async (orgId: string) => {
    try { setKeys(await listKeys(orgId)) } catch (e) { setErr((e as Error).message) }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const o = await currentOrg()
        if (o) { setOrg(o); void loadKeys(o.id) }
      } catch (e) { setErr((e as Error).message) }
      try { setIdx(await fetchApiIndex()) } catch (e) { setIdxErr((e as Error).message) }
    })()
  }, [loadKeys])

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
      const k = await createKey(org.id, name.trim() || 'Untitled key', scopes)
      setMinted(k); setName('')
      void loadKeys(org.id)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const kill = async (k: ApiKeyRow) => {
    if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return
    try { await revokeKey(k.id); if (org) void loadKeys(org.id) }
    catch (e) { setErr((e as Error).message) }
  }

  const live = useMemo(() => (keys ?? []).filter((k) => !k.revoked_at), [keys])
  const dead = useMemo(() => (keys ?? []).filter((k) => k.revoked_at), [keys])

  const claudeConfig = `{
  "mcpServers": {
    "auditbuilder": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}`

  const curl = `curl -H "Authorization: Bearer YOUR_KEY" \\
  ${API_BASE}/v1/audits`

  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>API and MCP</h1>
        <p>
          Everything the app does, this does too. The same handlers sit behind both surfaces,
          so they cannot drift apart: a REST call and a tool call reach identical code.
        </p>
      </header>

      {err && <div className="issue"><b>Problem</b>{err}</div>}

      {/* ------------------------------------------------------------ keys */}
      <section className="doc-s">
        <h2>1. Get a key</h2>
        <p className="doc-p">
          A key belongs to a workspace{org ? ` (${org.name})` : ''}, not to you, and carries the
          same permissions as the workspace. The plaintext is shown once, here, and never stored:
          only its hash is kept, so a leaked database does not leak working keys.
        </p>

        <div className="keymint">
          <input value={name} placeholder="What is it for? e.g. Claude Desktop"
            onChange={(e) => setName(e.target.value)} />
          {(['read', 'write'] as const).map((s) => (
            <label key={s} className="keyscope">
              <input type="checkbox" checked={scopes.includes(s)}
                onChange={() => setScopes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])} />
              {s}
            </label>
          ))}
          <button className="btn pri" onClick={mint} disabled={busy || !org || scopes.length === 0}>
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
            <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {live.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td><code>{k.prefix}…</code></td>
                  <td>{k.scopes.join(', ')}</td>
                  <td className="dim">{k.last_used_at
                    ? new Date(k.last_used_at).toLocaleDateString() : 'never'}</td>
                  <td><button className="btn sm danger" onClick={() => kill(k)}>Revoke</button></td>
                </tr>
              ))}
              {dead.map((k) => (
                <tr key={k.id} className="off">
                  <td>{k.name}</td>
                  <td><code>{k.prefix}…</code></td>
                  <td>{k.scopes.join(', ')}</td>
                  <td className="dim">revoked {new Date(k.revoked_at!).toLocaleDateString()}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {keys && keys.length === 0 && <p className="doc-none">No keys yet.</p>}
      </section>

      {/* ------------------------------------------------------------- MCP */}
      <section className="doc-s">
        <h2>2. Connect Claude, or anything else that speaks MCP</h2>
        <p className="doc-p">
          Streamable HTTP, JSON-RPC 2.0, stateless. There is no session to keep alive and
          no process to run: point a client at the URL with your key in the header.
        </p>
        <Snippet id="mcp" text={MCP_URL} copied={copied} onCopy={copy} label="MCP endpoint" />
        <Snippet id="cfg" text={claudeConfig} copied={copied} onCopy={copy} label="Client config" block />
      </section>

      {/* ------------------------------------------------------------ REST */}
      <section className="doc-s">
        <h2>3. Or call it directly</h2>
        <Snippet id="curl" text={curl} copied={copied} onCopy={copy} label="Try it" block />
        {idxErr && (
          <div className="issue">
            <b>The API did not answer</b>
            The routes below could not be read from the worker, so nothing is listed rather
            than something possibly wrong. {idxErr}
          </div>
        )}
        {idx && (
          <>
            <h3 className="doc-h3">Routes</h3>
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
            {idx.tools && (
              <>
                <h3 className="doc-h3">Tools, {idx.tools.length} of them</h3>
                <dl className="toollist">
                  {idx.tools.map((t) => (
                    <div key={t.name}>
                      <dt><code>{t.name}</code></dt>
                      <dd>{t.description}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </>
        )}
      </section>

      <section className="doc-s">
        <h2>Before you write findings</h2>
        <p className="doc-p">
          Call <code>get_field_schema</code> first, or <code>GET /v1/schema</code>. It returns every
          field on the record, its type, and who is meant to supply it. In a logic audit the
          database generates and constrains a good half of them, and it will reject a write that
          contradicts what it derives, so guessing at the shape wastes a round trip.
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
