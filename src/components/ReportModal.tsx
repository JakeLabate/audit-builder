import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Audit, Brand, FindingFull } from '../lib/types'
import { updateAudit } from '../lib/api'
import { buildPrintDocument, printDocument } from '../export/pdf'
import { PRINT_CSS } from '../export/print.css'
import { CATALOGUE, pageCount, sectionsOf, type SectionChoice } from '../lib/sections'

/**
 * The export screen. Choose what the report contains on the left, watch the
 * actual document redraw on the right.
 *
 * The preview is not a mock. It is the same buildPrintDocument output and the
 * same print stylesheet the PDF uses, rendered into an iframe and scaled down,
 * so what you approve here is what the client receives.
 */

const PAGE_W = 794   // 210mm at 96dpi
const PAGE_H = 1123  // 297mm

export default function ReportModal({
  audit, brand, findings, byline, logoUrl, onClose, onChange,
}: {
  audit: Audit
  brand: Brand
  findings: FindingFull[]
  byline: string
  logoUrl: string | null
  onClose: () => void
  onChange: (a: Audit) => void
}) {
  const [list, setList] = useState<SectionChoice[]>(() => sectionsOf(audit))
  const [doc, setDoc] = useState('')
  const [scale, setScale] = useState(0.45)
  const [err, setErr] = useState<string | null>(null)
  const save = useRef<number | undefined>(undefined)
  const draw = useRef<number | undefined>(undefined)
  const stage = useRef<HTMLDivElement>(null)

  const total = pageCount(list, findings.length)
  const meta = (k: string) => CATALOGUE.find((c) => c.key === k)!

  /* Escape closes, and the page behind does not scroll while this is open. */
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

  /* Fit a whole page into the stage, height included. Fitting to width alone
   * shows the top of the cover and nothing else, which is useless for judging
   * a document. One page visible, scroll for the next. */
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => setScale(Math.min(
      1,
      (el.clientWidth - 28) / PAGE_W,
      (el.clientHeight - 28) / PAGE_H,
    ))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Redraw the document. Debounced, because a toggle is a keystroke-speed
   * action and rebuilding every page on each one is wasted work. */
  useEffect(() => {
    window.clearTimeout(draw.current)
    draw.current = window.setTimeout(() => {
      const preview = { ...audit, sections: list }
      const html = buildPrintDocument(brand, preview, findings, byline, logoUrl)
      setDoc(`<!doctype html><html><head><meta charset="utf-8">
        <style>${PRINT_CSS}
          html,body{margin:0}
          .page{box-shadow:0 1px 4px rgba(25,26,62,.22);margin-bottom:16px}
        </style></head><body>${html}</body></html>`)
    }, 140)
    return () => window.clearTimeout(draw.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, findings, brand, logoUrl, byline])

  /* Persist. The choice belongs to the audit, not to this dialog. */
  useEffect(() => {
    window.clearTimeout(save.current)
    save.current = window.setTimeout(async () => {
      try {
        await updateAudit(audit.id, { sections: list } as Partial<Audit>)
        onChange({ ...audit, sections: list })
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 600)
    return () => window.clearTimeout(save.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  const toggle = (i: number) =>
    setList((p) => p.map((s, j) => (j === i ? { ...s, on: !s.on } : s)))

  const move = (i: number, by: -1 | 1) =>
    setList((p) => {
      const j = i + by
      // The cover is the first page or it is not a cover.
      if (j < 0 || j >= p.length || p[i].key === 'cover' || p[j].key === 'cover') return p
      const next = [...p]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const exportNow = useCallback(() => {
    printDocument(
      buildPrintDocument(brand, { ...audit, sections: list }, findings, byline, logoUrl),
      PRINT_CSS, audit.title,
    )
  }, [brand, audit, list, findings, byline, logoUrl])

  const noFindings = !list.some((s) => s.key === 'findings' && s.on)
  const empty = total === 0

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export PDF">

        <header className="modal-hd">
          <div>
            <h2>Export PDF</h2>
            <p>{audit.title} &nbsp;·&nbsp; {brand.name}</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="modal-bd">
          <div className="rs-pane">
            <div className="rs-pane-hd">
              <h3>What the report contains</h3>
              <span className="rs-count"><b>{total}</b> {total === 1 ? 'page' : 'pages'}</span>
            </div>
            <p className="rs-pane-sub">Saved on this audit, so every export of it has the same shape.</p>

            <ol className="rs-list">
              {list.map((s, i) => {
                const c = meta(s.key)
                const blocked = c.needs?.(audit) ?? null
                const pages = c.pages === 'per-finding' ? findings.length : c.pages
                return (
                  <li key={s.key} className={'rs-row' + (s.on ? '' : ' off')}>
                    <div className="rs-move">
                      <button className="rs-arrow" onClick={() => move(i, -1)}
                        disabled={i === 0 || s.key === 'cover' || list[i - 1]?.key === 'cover'}
                        aria-label={`Move ${c.name} earlier`}>↑</button>
                      <button className="rs-arrow" onClick={() => move(i, 1)}
                        disabled={i === list.length - 1 || s.key === 'cover'}
                        aria-label={`Move ${c.name} later`}>↓</button>
                    </div>
                    <label className="rs-tick">
                      <input type="checkbox" checked={s.on} onChange={() => toggle(i)} />
                      <span className="rs-box" />
                    </label>
                    <div className="rs-body">
                      <div className="rs-name">
                        {c.name}
                        <span className="rs-pages">
                          {pages} {pages === 1 ? 'page' : 'pages'}
                          {c.pages === 'per-finding' ? ', one per finding' : ''}
                        </span>
                      </div>
                      <p className="rs-what">{c.what}</p>
                      {s.on && blocked && <p className="rs-warn">{blocked}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>

            {noFindings && !empty && (
              <div className="rs-note">
                The findings are off, so this is a summary with no detail behind it. Right for a
                board readout, wrong for a handover to the team doing the work.
              </div>
            )}
            {err && <div className="issue" style={{ marginTop: 12 }}><b>Could not save</b>{err}</div>}
          </div>

          <div className="rs-stage" ref={stage}>
            {empty ? (
              <div className="rs-stage-empty">
                <b>Nothing selected</b>
                <span>Switch a section on and it appears here.</span>
              </div>
            ) : (
              <div style={{ width: PAGE_W * scale, height: (PAGE_H + 16) * total * scale }}>
                <iframe
                  title="Report preview"
                  srcDoc={doc}
                  scrolling="no"
                  style={{
                    width: PAGE_W, height: (PAGE_H + 16) * total, border: 0,
                    transform: `scale(${scale})`, transformOrigin: 'top left',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <footer className="modal-ft">
          <span className="rs-ft-note">
            This preview is the document itself, not a mock. What you see is what prints.
          </span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn pri" onClick={exportNow} disabled={empty}>Export PDF</button>
        </footer>

      </div>
    </div>
  )
}
