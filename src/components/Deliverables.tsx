import { useCallback, useEffect, useState } from 'react'
import { deleteExport, listExports, type ExportRow } from '../lib/exports'

/**
 * Every export this audit has produced, with both links.
 *
 * The point is that a deliverable is a thing you can point at. Before this the
 * register URL survived twenty seconds and the document survived not at all,
 * so there was no answer to "what did we actually send them".
 */
export default function Deliverables({ auditId, reload }: { auditId: string; reload: number }) {
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setRows(await listExports(auditId)) } catch (e) { setErr((e as Error).message) }
  }, [auditId])

  useEffect(() => { void load() }, [load, reload])

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    } catch { setErr('Your browser would not let the page copy. Use the link instead.') }
  }

  const drop = async (id: string) => {
    if (!confirm('Remove this export from the list? The files themselves stay where they are.')) return
    try { await deleteExport(id); void load() } catch (e) { setErr((e as Error).message) }
  }

  if (rows && rows.length === 0) {
    return (
      <section className="dlv">
        <h3>Deliverables</h3>
        <p className="dlv-none">
          Nothing exported yet. Run an export and both links land here, permanently.
        </p>
      </section>
    )
  }

  return (
    <section className="dlv">
      <h3>Deliverables</h3>
      {err && <p className="dlv-err">{err}</p>}
      {!rows ? <p className="dlv-none">Loading</p> : (
        <ol className="dlv-list">
          {rows.map((r) => (
            <li key={r.id} className="dlv-row">
              <div className="dlv-when">
                <b>{new Date(r.created_at).toLocaleDateString('en-US',
                  { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                <span>{new Date(r.created_at).toLocaleTimeString('en-US',
                  { hour: 'numeric', minute: '2-digit' })}</span>
                {r.finding_count != null && (
                  <span>{r.finding_count} finding{r.finding_count === 1 ? '' : 's'}</span>
                )}
                {r.created_by && <span className="dlv-by">{r.created_by}</span>}
              </div>

              <div className="dlv-links">
                <Artifact label="Document" kind="pdf" url={r.pdf_url}
                  copied={copied === `${r.id}-pdf`} onCopy={() => copy(`${r.id}-pdf`, r.pdf_url!)} />
                <Artifact label="Register" kind="sheet" url={r.sheet_url}
                  copied={copied === `${r.id}-sheet`} onCopy={() => copy(`${r.id}-sheet`, r.sheet_url!)} />
              </div>

              <button className="dlv-x" onClick={() => drop(r.id)}
                aria-label="Remove this export from the list">×</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Artifact({ label, kind, url, copied, onCopy }: {
  label: string; kind: 'pdf' | 'sheet'; url: string | null
  copied: boolean; onCopy: () => void
}) {
  if (!url) {
    return (
      <div className={`dlv-a off ${kind}`}>
        <span className="dlv-a-l">{label}</span>
        <span className="dlv-a-n">not produced</span>
      </div>
    )
  }
  return (
    <div className={`dlv-a ${kind}`}>
      <span className="dlv-a-l">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="dlv-a-open">Open</a>
      <button className="dlv-a-copy" onClick={onCopy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  )
}
