import { useCallback, useEffect, useState } from 'react'
import { LINK_DAYS, deleteExport, documentLink, listExports, type ExportRow } from '../lib/exports'

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

  const drop = async (r: ExportRow) => {
    if (!confirm('Delete this export? The document is removed from storage and any link to it stops working. The register in your Drive is untouched.')) return
    try { await deleteExport(r.id, r.pdf_path); void load() } catch (e) { setErr((e as Error).message) }
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
      <p className="dlv-note">
        Document links are signed and last {LINK_DAYS} days. Copy one again whenever you
        need a fresh one. The file itself is private to this workspace.
      </p>
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
                <Artifact label="Document" kind="pdf" has={!!r.pdf_path}
                  copied={copied === `${r.id}-pdf`}
                  onCopy={async () => copy(`${r.id}-pdf`, await documentLink(r.pdf_path!))}
                  onOpen={async () => window.open(await documentLink(r.pdf_path!), '_blank', 'noopener')} />
                <Artifact label="Register" kind="sheet" has={!!r.sheet_url}
                  copied={copied === `${r.id}-sheet`}
                  onCopy={() => copy(`${r.id}-sheet`, r.sheet_url!)}
                  onOpen={() => window.open(r.sheet_url!, '_blank', 'noopener')} />
              </div>

              <button className="dlv-x" onClick={() => drop(r)}
                aria-label="Remove this export from the list">×</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Artifact({ label, kind, has, copied, onCopy, onOpen }: {
  label: string; kind: 'pdf' | 'sheet'; has: boolean
  copied: boolean; onCopy: () => void; onOpen: () => void
}) {
  if (!has) {
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
      <button className="dlv-a-open" onClick={onOpen}>Open</button>
      <button className="dlv-a-copy" onClick={onCopy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  )
}
