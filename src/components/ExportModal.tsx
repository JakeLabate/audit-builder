import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Audit, Brand, FindingFull } from '../lib/types'
import { updateAudit } from '../lib/api'
import { buildPrintDocument, printDocument } from '../export/pdf'
import { PRINT_CSS } from '../export/print.css'
import { exportToSheets } from '../export/sheets'
import { CATALOGUE, pageCount, sectionsOf, type SectionChoice } from '../lib/sections'
import { SHEET_COLUMNS, columnsOf, withRefs, type ColChoice } from '../lib/sheetcols'
import { clientFindings } from '../lib/depth'

/**
 * One export, two halves.
 *
 * The register is the record: every field, every finding, nothing omitted.
 * The document is the argument the register supports: what was found, what it
 * costs, what to do. They ship together, and the document carries a link to
 * the register, so "the rest is in the sheet" is a fact rather than an excuse.
 *
 * The document preview is the document itself, in an iframe, on the same
 * stylesheet the PDF prints from. The register preview imitates the grid,
 * because the real sheet only exists once Google has made it.
 */

const PAGE_W = 794
const PAGE_H = 1123

type Tab = 'document' | 'register'

export default function ExportModal({
  audit, brand, findings, byline, logoUrl, sheetsReady, onClose, onChange, say,
}: {
  audit: Audit
  brand: Brand
  findings: FindingFull[]
  byline: string
  logoUrl: string | null
  sheetsReady: boolean
  onClose: () => void
  onChange: (a: Audit) => void
  say: (msg: string, url?: string) => void
}) {
  const [tab, setTab] = useState<Tab>('document')
  const [sections, setSections] = useState<SectionChoice[]>(() => sectionsOf(audit))
  const [cols, setCols] = useState<ColChoice[]>(() => columnsOf(audit))
  const [doc, setDoc] = useState('')
  const [scale, setScale] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = useRef<number | undefined>(undefined)
  const draw = useRef<number | undefined>(undefined)
  const stage = useRef<HTMLDivElement>(null)

  // What the client actually receives. An internal finding is in the register
  // for you, not for them, and neither export should carry it.
  const shown = clientFindings(findings)
  const hidden = findings.length - shown.length
  const pages = pageCount(sections, shown.length)
  const onCols = cols.filter((c) => c.on)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', key)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', key)
      document.body.style.overflow = prev
    }
  }, [onClose, busy])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el || tab !== 'document') return
    const fit = () => setScale(Math.min(
      1, (el.clientWidth - 28) / PAGE_W, (el.clientHeight - 28) / PAGE_H,
    ))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab])

  useEffect(() => {
    if (tab !== 'document') return
    window.clearTimeout(draw.current)
    draw.current = window.setTimeout(() => {
      const preview = { ...audit, sections } as Audit
      const html = buildPrintDocument(brand, preview, findings, byline, logoUrl, null)
      setDoc(`<!doctype html><html><head><meta charset="utf-8">
        <style>${PRINT_CSS}
          html,body{margin:0}
          .page{box-shadow:0 1px 4px rgba(25,26,62,.22);margin-bottom:16px}
        </style></head><body>${html}</body></html>`)
    }, 140)
    return () => window.clearTimeout(draw.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, findings, brand, logoUrl, byline, tab])

  useEffect(() => {
    window.clearTimeout(save.current)
    save.current = window.setTimeout(async () => {
      try {
        const patch = { sections, sheet_columns: cols } as unknown as Partial<Audit>
        await updateAudit(audit.id, patch)
        onChange({ ...audit, ...patch } as Audit)
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 600)
    return () => window.clearTimeout(save.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, cols])

  /**
   * The register is made first so the document can point at it. If Google is
   * not connected the document still exports, without the link, rather than
   * the whole export failing on the half that needs an account.
   */
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    const live = { ...audit, sections, sheet_columns: cols } as Audit
    let sheetUrl: string | null = null
    try {
      if (sheetsReady) sheetUrl = await exportToSheets(brand, live, findings, byline)
    } catch (e) {
      setErr(`The register could not be created, so the document has no link to it. ${(e as Error).message}`)
    }
    try {
      printDocument(
        buildPrintDocument(brand, live, findings, byline, logoUrl, sheetUrl),
        PRINT_CSS, audit.title,
      )
      if (sheetUrl) say('Register created in your Drive.', sheetUrl)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [audit, sections, cols, brand, findings, byline, logoUrl, sheetsReady, say])

  const secMeta = (k: string) => CATALOGUE.find((c) => c.key === k)!
  const colMeta = new Map(SHEET_COLUMNS.map((c) => [c.key, c]))

  const moveSection = (i: number, by: -1 | 1) => setSections((p) => {
    const j = i + by
    if (j < 0 || j >= p.length || p[i].key === 'cover' || p[j].key === 'cover') return p
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const moveCol = (i: number, by: -1 | 1) => setCols((p) => {
    const j = i + by
    if (j < 0 || j >= p.length) return p
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n
  })

  const previewCols = withRefs(
    onCols.map((c) => colMeta.get(c.key)!).filter(Boolean), findings,
  )
  const previewRows = [...shown].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 8)

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export">

        <header className="modal-hd">
          <div>
            <h2>Export</h2>
            <p>{audit.title} &nbsp;·&nbsp; {brand.name}</p>
          </div>
          <div className="ex-tabs">
            <button className={'tab' + (tab === 'document' ? ' on' : '')} onClick={() => setTab('document')}>
              Document <span>{pages} {pages === 1 ? 'page' : 'pages'}</span>
            </button>
            <button className={'tab' + (tab === 'register' ? ' on' : '')} onClick={() => setTab('register')}>
              Register <span>{onCols.length} columns</span>
            </button>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </header>

        <div className="modal-bd">
          <div className="rs-pane">
            {tab === 'document' ? (
              <>
                <div className="rs-pane-hd"><h3>What the document contains</h3></div>
                <p className="rs-pane-sub">
                  Every finding gets its own page, carrying the measurements behind the claim
                  and the exhibit that shows it. Everything else is in the register.
                </p>

                <ol className="rs-list">
                  {sections.map((s, i) => {
                    const c = secMeta(s.key)
                    const blocked = c.needs?.(audit) ?? null
                    const n = c.pages === 'per-finding' ? shown.length : c.pages
                    return (
                      <li key={s.key} className={'rs-row' + (s.on ? '' : ' off')}>
                        <div className="rs-move">
                          <button className="rs-arrow" onClick={() => moveSection(i, -1)}
                            disabled={i === 0 || s.key === 'cover' || sections[i - 1]?.key === 'cover'}
                            aria-label={`Move ${c.name} earlier`}>↑</button>
                          <button className="rs-arrow" onClick={() => moveSection(i, 1)}
                            disabled={i === sections.length - 1 || s.key === 'cover'}
                            aria-label={`Move ${c.name} later`}>↓</button>
                        </div>
                        <label className="rs-tick">
                          <input type="checkbox" checked={s.on}
                            onChange={() => setSections((p) => p.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                          <span className="rs-box" />
                        </label>
                        <div className="rs-body">
                          <div className="rs-name">{c.name}
                            <span className="rs-pages">{n} {n === 1 ? 'page' : 'pages'}</span>
                          </div>
                          <p className="rs-what">{c.what}</p>
                          {s.on && blocked && <p className="rs-warn">{blocked}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : (
              <>
                <div className="rs-pane-hd"><h3>Columns on the Findings tab</h3></div>
                <p className="rs-pane-sub">
                  The register is the complete record. Every column carries a note under its
                  header, so somebody who was not in the audit can read it without asking you.
                </p>
                <ol className="rs-list sc-list">
                  {cols.map((c, i) => {
                    const m = colMeta.get(c.key)
                    if (!m) return null
                    return (
                      <li key={c.key} className={'sc-row' + (c.on ? '' : ' off')}>
                        <div className="rs-move">
                          <button className="rs-arrow" onClick={() => moveCol(i, -1)} disabled={i === 0}
                            aria-label={`Move ${m.header} left`}>↑</button>
                          <button className="rs-arrow" onClick={() => moveCol(i, 1)}
                            disabled={i === cols.length - 1}
                            aria-label={`Move ${m.header} right`}>↓</button>
                        </div>
                        <label className="rs-tick">
                          <input type="checkbox" checked={c.on}
                            onChange={() => setCols((p) => p.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                          <span className="rs-box" />
                        </label>
                        <div className="rs-body">
                          <div className="rs-name">{m.header}</div>
                          <p className="rs-what">{m.note}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
            {err && <div className="issue" style={{ marginTop: 12 }}><b>Problem</b>{err}</div>}
          </div>

          <div className={'rs-stage' + (tab === 'register' ? ' sc-stage' : '')} ref={stage}>
            {tab === 'document' ? (
              pages === 0 ? (
                <div className="rs-stage-empty">
                  <b>Nothing selected</b><span>Switch a section on and it appears here.</span>
                </div>
              ) : (
                <div style={{ width: PAGE_W * scale, height: (PAGE_H + 16) * pages * scale }}>
                  <iframe title="Document preview" srcDoc={doc} scrolling="no"
                    style={{
                      width: PAGE_W, height: (PAGE_H + 16) * pages, border: 0,
                      transform: `scale(${scale})`, transformOrigin: 'top left',
                    }} />
                </div>
              )
            ) : previewCols.length === 0 ? (
              <div className="rs-stage-empty">
                <b>No columns</b><span>Switch one on and the register appears here.</span>
              </div>
            ) : (
              <div className="sc-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>{previewCols.map((c) => (
                      <th key={c.key} style={{ minWidth: Math.round(c.width * 0.62) }}>{c.header}</th>
                    ))}</tr>
                    <tr className="sc-notes">{previewCols.map((c) => <td key={c.key}>{c.note}</td>)}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((f) => (
                      <tr key={f.id}>
                        {previewCols.map((c) => (
                          <td key={c.key} className={c.key === 'band' ? 'sc-band b-' + (f.band ?? '').toLowerCase() : ''}>
                            {String(c.value(f) ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length > previewRows.length && (
                  <p className="sc-more">
                    Showing {previewRows.length} of {shown.length}. The register carries all of them.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="modal-ft">
          <span className="rs-ft-note">
            {sheetsReady
              ? 'Creates the register in your Drive, then opens the document to print with a link to it.'
              : 'Google is not connected, so only the document is produced.'}
            {hidden > 0 && ` ${hidden} internal ${hidden === 1 ? 'finding is' : 'findings are'} excluded from both.`}
          </span>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn pri" onClick={run} disabled={busy || pages === 0}>
            {busy ? 'Exporting' : 'Export'}
          </button>
        </footer>

      </div>
    </div>
  )
}
