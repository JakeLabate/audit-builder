import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createFinding, getAudit, listBrands, listFindings, nextRef, updateAudit,
} from '../lib/api'
import type { Audit, Brand, FindingFull } from '../lib/types'
import FindingEditor from '../components/FindingEditor'
import { download, slug, toCsv, toDocument } from '../export/serialize'
import { buildPrintDocument, printDocument } from '../export/pdf'
import { PRINT_CSS } from '../export/print.css'
import { exportToSheets, sheetsConfigured } from '../export/sheets'
import { supabase } from '../lib/supabase'

export default function AuditView() {
  const { auditId } = useParams()
  const [audit, setAudit] = useState<Audit | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [findings, setFindings] = useState<FindingFull[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (!auditId) return
      const a = await getAudit(auditId)
      setAudit(a)
      if (a) {
        const brands = await listBrands()
        setBrand(brands.find((b) => b.id === a.brand_id) ?? null)
        const fs = await listFindings(auditId)
        setFindings(fs)
        setSel(fs[0]?.id ?? null)
      }
    })()
  }, [auditId])

  // A toast carrying a link stays up long enough to be clicked, and is
  // dismissible, because the link is sometimes the only way to reach the result.
  const say = (msg: string, url?: string) => {
    setToast({ msg, url })
    setTimeout(() => setToast(null), url ? 20000 : 3200)
  }

  const shown = useMemo(() => {
    const s = q.toLowerCase()
    const list = s
      ? findings.filter((f) => f.title.toLowerCase().includes(s) || f.ref.toLowerCase().includes(s))
      : findings
    return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  }, [findings, q])

  const current = findings.find((f) => f.id === sel) ?? null

  async function add() {
    if (!audit) return
    const ref = await nextRef(audit.id, 'TECH')
    const f = await createFinding(audit.org_id, audit.id, ref, '', findings.length)
    setFindings((p) => [...p, f])
    setSel(f.id)
  }

  function exportJson() {
    if (!brand || !audit) return
    download(`${slug(brand.name)}-${slug(audit.title)}.json`,
      JSON.stringify(toDocument(brand, audit, findings), null, 2), 'application/json')
  }

  function exportCsv() {
    if (!brand || !audit) return
    download(`${slug(brand.name)}-${slug(audit.title)}.csv`, toCsv(findings), 'text/csv')
  }

  async function exportPdf() {
    if (!brand || !audit) return
    const { data } = await supabase.auth.getUser()
    const byline =
      (data.user?.user_metadata as { full_name?: string })?.full_name ?? data.user?.email ?? ''
    printDocument(buildPrintDocument(brand, audit, findings, byline), PRINT_CSS, audit.title)
  }

  async function exportSheets() {
    if (!brand || !audit) return
    setBusy(true)
    // Open the tab synchronously, while the click is still the active user
    // gesture. Opening it after the await gets silently blocked, because by
    // then the browser no longer connects the call to the click.
    const tab = window.open('', '_blank')
    try {
      const { data } = await supabase.auth.getUser()
      const byline =
        (data.user?.user_metadata as { full_name?: string })?.full_name ?? data.user?.email ?? ''
      const url = await exportToSheets(brand, audit, findings, byline)
      if (tab && !tab.closed) {
        tab.location.href = url
        say('Sheet created in your Drive.')
      } else {
        // Blocked or closed. Hand over a link instead of losing the sheet.
        say('Sheet created in your Drive.', url)
      }
    } catch (e) {
      if (tab && !tab.closed) tab.close()
      say((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!audit || !brand) return <div className="wrap"><span className="saving">Loading</span></div>

  return (
    <>
      <div className="top" style={{ borderTop: '1px solid var(--line)', height: 46 }}>
        <div className="crumbs">
          <Link to="/">Brands</Link><span>/</span>
          <Link to={`/brand/${brand.id}`}>{brand.name}</Link><span>/</span>
          <b>{audit.title}</b>
        </div>
        <span className="grow" />
        <button className="btn sm" onClick={exportJson}>JSON</button>
        <button className="btn sm" onClick={exportCsv}>CSV</button>
        <button className="btn sm" onClick={exportPdf}>PDF</button>
        <button className="btn sm" onClick={exportSheets} disabled={busy || !sheetsConfigured()}
          title={sheetsConfigured() ? 'Creates a new sheet in your Drive' : 'Set VITE_GOOGLE_CLIENT_ID to enable'}>
          {busy ? 'Working...' : 'Sheets'}
        </button>
      </div>

      <div className="split">
        <div className="list">
          <div className="listbar">
            <input placeholder="Filter findings" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm pri" onClick={add}>New</button>
          </div>
          {shown.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13.5 }}>
              No findings yet. Every finding is the same forty fields, so start one and fill what you know.
            </div>
          ) : (
            shown.map((f) => (
              <div className="frow" key={f.id} aria-selected={f.id === sel} onClick={() => setSel(f.id)}>
                <span className="ref">{f.ref}</span>
                <span className="nm">
                  {f.title || <em style={{ color: 'var(--muted)' }}>Untitled</em>}
                  <span>{f.owner ?? 'no owner'} &nbsp;·&nbsp; {f.examples.length} exhibits</span>
                </span>
                <span className={`pill ${f.band ?? 'none'}`}>{f.band ?? '--'}</span>
              </div>
            ))
          )}
        </div>

        <div className="pane">
          {current ? (
            <FindingEditor
              finding={current}
              onChange={(f) => setFindings((p) => p.map((x) => (x.id === f.id ? f : x)))}
              onDeleted={() => {
                setFindings((p) => p.filter((x) => x.id !== current.id))
                setSel(null)
              }}
            />
          ) : (
            <div className="empty" style={{ marginTop: 40 }}>
              <b>Nothing selected</b>
              <span>Pick a finding on the left, or start a new one.</span>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.url && (
            <a href={toast.url} target="_blank" rel="noopener noreferrer">Open it</a>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss">&times;</button>
        </div>
      )}
      <AuditMeta audit={audit} onChange={setAudit} />
    </>
  )
}

/** Audit-level fields the document needs but the finding list does not show. */
function AuditMeta({ audit, onChange }: { audit: Audit; onChange: (a: Audit) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 30 }}>
      {open && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--line)', padding: 16,
          width: 330, marginBottom: 8, boxShadow: '0 14px 40px rgba(25,26,62,.18)',
        }}>
          <div className="fld">
            <label>Audit title</label>
            <input value={audit.title}
              onChange={(e) => onChange({ ...audit, title: e.target.value })}
              onBlur={() => updateAudit(audit.id, { title: audit.title })} />
          </div>
          <div className="two">
            <div className="fld">
              <label>Status</label>
              <select value={audit.status}
                onChange={(e) => { const v = e.target.value as Audit['status']; onChange({ ...audit, status: v }); updateAudit(audit.id, { status: v }) }}>
                <option value="draft">draft</option><option value="in_review">in review</option>
                <option value="delivered">delivered</option><option value="archived">archived</option>
              </select>
            </div>
            <div className="fld">
              <label>URLs crawled</label>
              <input type="number" value={audit.urls_crawled ?? ''}
                onChange={(e) => onChange({ ...audit, urls_crawled: e.target.value ? Number(e.target.value) : null })}
                onBlur={() => updateAudit(audit.id, { urls_crawled: audit.urls_crawled })} />
            </div>
          </div>
          <div className="fld">
            <label>Gaps</label>
            <textarea value={audit.gaps ?? ''}
              onChange={(e) => onChange({ ...audit, gaps: e.target.value })}
              onBlur={() => updateAudit(audit.id, { gaps: audit.gaps })} />
            <div className="hint">What was not available. An audit missing log files says so upfront.</div>
          </div>
        </div>
      )}
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close audit settings' : 'Audit settings'}
      </button>
    </div>
  )
}
