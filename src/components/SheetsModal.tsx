import { useEffect, useRef, useState } from 'react'
import type { Audit, FindingFull } from '../lib/types'
import { updateAudit } from '../lib/api'
import { SHEET_COLUMNS, columnsOf, withRefs, type ColChoice } from '../lib/sheetcols'

/**
 * The spreadsheet export screen. Pick the columns and their order on the
 * left, watch the Findings tab redraw on the right.
 *
 * Unlike the PDF dialog this preview is a representation rather than the
 * document itself, because the real thing only exists once Google has made
 * it. It is built from the same catalogue and the same rows, so the columns,
 * their order and their notes are exact; only the chrome is imitated.
 */
export default function SheetsModal({
  audit, findings, busy, onClose, onChange, onExport,
}: {
  audit: Audit
  findings: FindingFull[]
  busy: boolean
  onClose: () => void
  onChange: (a: Audit) => void
  onExport: () => void
}) {
  const [list, setList] = useState<ColChoice[]>(() => columnsOf(audit))
  const [err, setErr] = useState<string | null>(null)
  const save = useRef<number | undefined>(undefined)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', key)
      document.body.style.overflow = prev
    }
  }, [onClose])

  useEffect(() => {
    window.clearTimeout(save.current)
    save.current = window.setTimeout(async () => {
      try {
        await updateAudit(audit.id, { sheet_columns: list } as Partial<Audit>)
        onChange({ ...audit, sheet_columns: list } as Audit)
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 600)
    return () => window.clearTimeout(save.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  const by = new Map(SHEET_COLUMNS.map((c) => [c.key, c]))
  const on = list.filter((c) => c.on)
  const cols = withRefs(on.map((c) => by.get(c.key)!).filter(Boolean), findings)
  const rows = [...findings].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 8)

  const toggle = (i: number) => setList((p) => p.map((c, j) => (j === i ? { ...c, on: !c.on } : c)))
  const move = (i: number, d: -1 | 1) => setList((p) => {
    const j = i + d
    if (j < 0 || j >= p.length) return p
    const n = [...p]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export to Google Sheets">

        <header className="modal-hd">
          <div>
            <h2>Export to Google Sheets</h2>
            <p>{audit.title} &nbsp;·&nbsp; {on.length} of {SHEET_COLUMNS.length} columns</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="modal-bd">
          <div className="rs-pane">
            <div className="rs-pane-hd">
              <h3>Columns on the Findings tab</h3>
            </div>
            <p className="rs-pane-sub">
              Every column carries a note under its header, so somebody who was not in the
              audit can read the register without asking you what a heading means.
            </p>

            <ol className="rs-list sc-list">
              {list.map((c, i) => {
                const meta = by.get(c.key)
                if (!meta) return null
                return (
                  <li key={c.key} className={'sc-row' + (c.on ? '' : ' off')}>
                    <div className="rs-move">
                      <button className="rs-arrow" onClick={() => move(i, -1)} disabled={i === 0}
                        aria-label={`Move ${meta.header} left`}>↑</button>
                      <button className="rs-arrow" onClick={() => move(i, 1)}
                        disabled={i === list.length - 1}
                        aria-label={`Move ${meta.header} right`}>↓</button>
                    </div>
                    <label className="rs-tick">
                      <input type="checkbox" checked={c.on} onChange={() => toggle(i)} />
                      <span className="rs-box" />
                    </label>
                    <div className="rs-body">
                      <div className="rs-name">{meta.header}</div>
                      <p className="rs-what">{meta.note}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
            {err && <div className="issue" style={{ marginTop: 12 }}><b>Could not save</b>{err}</div>}
          </div>

          <div className="rs-stage sc-stage">
            {cols.length === 0 ? (
              <div className="rs-stage-empty">
                <b>No columns</b>
                <span>Switch one on and the register appears here.</span>
              </div>
            ) : (
              <div className="sc-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>{cols.map((c) => (
                      <th key={c.key} style={{ minWidth: Math.round(c.width * 0.62) }}>{c.header}</th>
                    ))}</tr>
                    <tr className="sc-notes">{cols.map((c) => <td key={c.key}>{c.note}</td>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        {cols.map((c) => (
                          <td key={c.key} className={c.key === 'band' ? 'sc-band b-' + (f.band ?? '').toLowerCase() : ''}>
                            {String(c.value(f) ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {findings.length > rows.length && (
                  <p className="sc-more">
                    Showing {rows.length} of {findings.length}. The export carries all of them.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="modal-ft">
          <span className="rs-ft-note">
            Four tabs are created: Summary, Findings, Roadmap and Method.
          </span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn pri" onClick={onExport} disabled={busy || cols.length === 0}>
            {busy ? 'Creating' : 'Create sheet'}
          </button>
        </footer>

      </div>
    </div>
  )
}
