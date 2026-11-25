import { useState } from 'react'
import { LINK_DAYS, deleteExport, documentLink, type ExportRow } from '../lib/exports'

/**
 * Every export this audit has produced, with both links.
 *
 * The point is that a deliverable is a thing you can point at. Before this the
 * register URL survived twenty seconds and the document survived not at all,
 * so there was no answer to "what did we actually send them".
 *
 * It lives in a rail down the left edge of the audit, the full height of the
 * workspace. Closed, the rail is a slim tab with a count. Open, the panel
 * takes the list column. It used to sit under the audit, below a workspace
 * that is exactly one screen tall, so it was always a scroll away and easy to
 * never find.
 */

/** The slim tab. The whole strip is the target, so it is easy to hit. */
export function DeliverablesRail({ count, open, onToggle }: {
  count: number | null
  open: boolean
  onToggle: () => void
}) {
  const n = count ?? 0
  return (
    <nav className="rail" aria-label="Audit panels">
      <button type="button" className={'rail-tab' + (open ? ' on' : '')}
        aria-expanded={open} aria-controls="dlv-panel" onClick={onToggle}
        aria-label={`Deliverables, ${n} ${n === 1 ? 'export' : 'exports'}`}
        title={open ? 'Close deliverables' : 'Open deliverables'}>
        <span className="rail-caret" aria-hidden="true" />
        {n > 0 && <b className="rail-n" aria-hidden="true">{n}</b>}
        <span className="rail-l" aria-hidden="true">Deliverables</span>
      </button>
    </nav>
  )
}

export default function Deliverables({ rows, error, onChanged, onClose, onExport }: {
  /** Null while the first read is in flight. */
  rows: ExportRow[] | null
  /** Why the list could not be read, if it could not. */
  error: string | null
  /** An export was deleted: read the list again. */
  onChanged: () => void
  onClose: () => void
  onExport: () => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (key: string, url: () => string | Promise<string>) => {
    try {
      await navigator.clipboard.writeText(await url())
      setErr(null)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    } catch { setErr('The link could not be copied. Use Open instead.') }
  }

  const open = async (url: () => string | Promise<string>) => {
    try { window.open(await url(), '_blank', 'noopener'); setErr(null) }
    catch (e) { setErr(`That would not open. ${(e as Error).message}`) }
  }

  const drop = async (r: ExportRow) => {
    if (!confirm('Delete this export? The document is removed from storage and any link to it stops working. The register in your Drive is untouched.')) return
    try { await deleteExport(r.id, r.pdf_path); setErr(null); onChanged() } catch (e) { setErr((e as Error).message) }
  }

  const problem = err ?? error

  return (
    <section className="dlv" id="dlv-panel" aria-label="Deliverables">
      <header className="dlv-hd">
        <h3>Deliverables</h3>
        <button type="button" className="dlv-close" onClick={onClose} aria-label="Close deliverables">&times;</button>
      </header>

      {problem && <p className="dlv-err" role="alert">{problem}</p>}

      {!rows ? (
        !error && <p className="dlv-none">Loading</p>
      ) : rows.length === 0 ? (
        <div className="dlv-empty">
          <p className="dlv-none">
            Nothing exported yet. Run an export and both links land here, permanently.
          </p>
          <button type="button" className="btn sm pri" onClick={onExport}>Export</button>
        </div>
      ) : (
        <>
          <p className="dlv-note">
            Document links are signed and last {LINK_DAYS} days. Copy one again whenever you
            need a fresh one. The file itself is private to this workspace.
          </p>
          <ol className="dlv-list">
            {rows.map((r) => (
              <li key={r.id} className="dlv-row">
                <div className="dlv-when">
                  <b>{new Date(r.created_at).toLocaleDateString('en-US',
                    { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  <span>
                    {new Date(r.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {r.finding_count != null && ` · ${r.finding_count} finding${r.finding_count === 1 ? '' : 's'}`}
                  </span>
                  {r.created_by && <span className="dlv-by">{r.created_by}</span>}
                </div>

                <div className="dlv-links">
                  <Artifact label="Document" kind="pdf" has={!!r.pdf_path}
                    copied={copied === `${r.id}-pdf`}
                    onCopy={() => copy(`${r.id}-pdf`, () => documentLink(r.pdf_path!))}
                    onOpen={() => open(() => documentLink(r.pdf_path!))} />
                  <Artifact label="Register" kind="sheet" has={!!r.sheet_url}
                    copied={copied === `${r.id}-sheet`}
                    onCopy={() => copy(`${r.id}-sheet`, () => r.sheet_url!)}
                    onOpen={() => open(() => r.sheet_url!)} />
                </div>

                <button type="button" className="dlv-x" onClick={() => drop(r)}
                  aria-label="Delete this export">&times;</button>
              </li>
            ))}
          </ol>
        </>
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
      <button type="button" className="dlv-a-open" onClick={onOpen}>Open</button>
      <button type="button" className="dlv-a-copy" onClick={onCopy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  )
}
