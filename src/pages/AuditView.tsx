import { useEffect, useMemo, useState } from 'react'
import Deliverables from '../components/Deliverables'
import { Link, useParams } from 'react-router-dom'
import {
  evidenceUrl, createFinding, getAudit, listBrands, listFindings, nextRef, updateAudit, updateFindings, withBands,
} from '../lib/api'
import { CascadeModal, type CascadeRow } from '../components/Fields'
import { registryOf } from '../lib/derive'
import type { Audit, Brand, FindingFull } from '../lib/types'
import FindingEditor from '../components/FindingEditor'
import LogicEditor from '../components/LogicEditor'
import ExportModal from '../components/ExportModal'
import { STAGE_LABEL, stage } from '../lib/lifecycle'
import { identityOf } from '../lib/brand'
import { sheetsConfigured } from '../export/sheets'
import { supabase } from '../lib/supabase'


export default function AuditView() {
  const { auditId } = useParams()
  const [audit, setAudit] = useState<Audit | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [findings, setFindings] = useState<FindingFull[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null)
  const [exported, setExported] = useState(0)
  // Resolved once when the dialog opens, so the preview and the printed
  // file are built from the same inputs.
  const [ex, setEx] = useState<{ byline: string; logoUrl: string | null } | null>(null)
  // The export dialog resolves the byline and the signed logo URL once on
  // open, so the preview and the printed file are built from the same inputs.

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

  const [stageFilter, setStageFilter] = useState<string | null>(null)

  const shown = useMemo(() => {
    const s = q.toLowerCase()
    let list = s
      ? findings.filter((f) => f.title.toLowerCase().includes(s) || f.ref.toLowerCase().includes(s))
      : findings
    if (stageFilter && audit) list = list.filter((f) => stage(f, audit.status) === stageFilter)
    return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  }, [findings, q, stageFilter, audit])

  // Where the audit stands after delivery, as counts. Clicking one filters.
  const stageCounts = useMemo(() => {
    if (!audit) return []
    const m = new Map<string, number>()
    for (const f of findings) {
      const s = stage(f, audit.status)
      m.set(s, (m.get(s) ?? 0) + 1)
    }
    return [...m.entries()]
  }, [findings, audit])

  const current = findings.find((f) => f.id === sel) ?? null

  async function add() {
    if (!audit) return
    // No category yet, so the reference is Uncategorized/n until one is
    // picked. The dates come from the audit, so nobody types them.
    const ref = await nextRef(audit.id, null)
    const f = await createFinding(audit.org_id, audit.id, ref, '', findings.length, {
      raised: audit.started_on ?? undefined,
      collected_from: audit.evidence_from,
      collected_to: audit.evidence_to,
    })
    setFindings((p) => withBands([...p, f]))
    setSel(f.id)
  }

  async function openExport() {
    if (!brand || !audit) return
    const { data } = await supabase.auth.getUser()
    const byline =
      (data.user?.user_metadata as { full_name?: string })?.full_name ?? data.user?.email ?? ''
    // The logo lives in a private bucket, so it has to be signed before either
    // the preview or the print window can load it.
    const path = identityOf(brand).logo_path
    setEx({ byline, logoUrl: path ? await evidenceUrl(path) : null })
  }


  if (!audit || !brand) return <div className="wrap"><span className="saving">Loading</span></div>

  return (
    <>
      <div className="top sub">
        <div className="crumbs">
          <Link to="/">Brands</Link><span>/</span>
          <Link to={`/brand/${brand.id}`}>{brand.name}</Link><span>/</span>
          <b>{audit.title}</b>
          <span className={'modetag ' + audit.mode}>
            {audit.mode === 'logic' ? 'Logic' : 'Manual'}
          </span>
        </div>
        <span className="grow" />
        <button className="btn sm pri" onClick={openExport}>Export</button>
      </div>

      <div className="split">
        <div className="list">
          <div className="listbar">
            <input placeholder="Filter findings" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm pri" onClick={add}>New</button>
          </div>
          {audit.status === 'delivered' && stageCounts.length > 0 && (
            <div className="stagesum">
              {stageCounts.map(([s, n]) => (
                <button key={s} className={`stg-chip${stageFilter === s ? ' on' : ''}`}
                  onClick={() => setStageFilter(stageFilter === s ? null : s)}>
                  <i className={`stg-dot ${s}`} />{STAGE_LABEL[s as keyof typeof STAGE_LABEL]} <b>{n}</b>
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <div className="list-empty">
              No findings yet. Every finding is the same 53 fields, so start one and fill what you know.
            </div>
          ) : (
            shown.map((f) => (
              <div className="frow" key={f.id} aria-selected={f.id === sel} onClick={() => setSel(f.id)}>
                <span className="ref">{f.ref}</span>
                <span className="nm">
                  {f.title || <em className="untitled">Untitled</em>}
                  <span>
                    <i className={`stg-dot ${stage(f, audit.status)}`} />{STAGE_LABEL[stage(f, audit.status)]}
                    &nbsp;·&nbsp; {f.owner ?? 'no owner'} &nbsp;·&nbsp; {f.examples.length} exhibits
                  </span>
                </span>
                <span className={`pill ${f.band ?? 'none'}`}>{f.band ?? '--'}</span>
              </div>
            ))
          )}
        </div>

        <div className="pane">
          {current ? (
            audit.mode === 'logic' ? (
              <LogicEditor
                finding={current}
                audit={audit}
                brand={brand}
                all={findings}
                onBrand={setBrand}
                onSaved={(f) => setFindings((p) => withBands(p.map((x) => (x.id === f.id ? f : x))))}
              />
            ) : (
              <FindingEditor
                finding={current}
                audit={audit}
                brand={brand}
                all={findings}
                onBrand={setBrand}
                onChange={(f) => setFindings((p) => withBands(p.map((x) => (x.id === f.id ? f : x))))}
                onDeleted={() => {
                  setFindings((p) => withBands(p.filter((x) => x.id !== current.id)))
                  setSel(null)
                }}
              />
            )
          ) : (
            <div className="empty" style={{ marginTop: 40 }}>
              <b>Nothing selected</b>
              <span>Pick a finding on the left, or start a new one.</span>
            </div>
          )}
        </div>
      </div>

      {audit && <Deliverables auditId={audit.id} reload={exported} />}

      {ex && brand && (
        <ExportModal
          audit={audit}
          brand={brand}
          findings={findings}
          byline={ex.byline}
          logoUrl={ex.logoUrl}
          sheetsReady={sheetsConfigured()}
          onChange={setAudit}
          onClose={() => setEx(null)}
          say={say}
          onExported={() => setExported((n) => n + 1)}
        />
      )}

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.url && (
            <a href={toast.url} target="_blank" rel="noopener noreferrer">Open it</a>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss">&times;</button>
        </div>
      )}
      <AuditMeta audit={audit} findings={findings} onChange={setAudit}
        cycleDays={registryOf(brand).crawl_cycle_days}
        onFindings={(ids, patch) => setFindings((p) => withBands(p.map((x) => (ids.includes(x.id) ? { ...x, ...patch } : x))))} />
    </>
  )
}

/** Audit-level fields the document needs but the finding list does not show. */
function AuditMeta({
  audit, findings, onChange, onFindings, cycleDays,
}: {
  audit: Audit
  findings: FindingFull[]
  cycleDays: number
  onChange: (a: Audit) => void
  onFindings: (ids: string[], patch: Partial<FindingFull>) => void
}) {
  const [open, setOpen] = useState(false)
  const [cascade, setCascade] = useState<{
    what: string; next: string; rows: CascadeRow[]; patch: Partial<FindingFull>
  } | null>(null)
  // What the audit held when the field was focused, so a cascade compares
  // findings against the old audit value rather than the half-typed one.
  const [before, setBefore] = useState<Audit>(audit)

  const fmt = (d: string | null) => d ?? 'not set'

  function commitStart() {
    if (audit.started_on === before.started_on || !audit.started_on) return
    updateAudit(audit.id, { started_on: audit.started_on })
    const next = audit.started_on
    const rows = findings.filter((f) => f.raised !== next).map((f) => ({
      id: f.id, ref: f.ref, title: f.title, current: f.raised, preTick: f.raised === before.started_on,
    }))
    // In logic mode Verify by is derived from Found on, so it moves with it.
    const patch: Partial<FindingFull> = { raised: next }
    if (audit.mode === 'logic') {
      const d = new Date(next + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + cycleDays)
      patch.verify_by = d.toISOString().slice(0, 10)
    }
    if (rows.length) setCascade({ what: 'Found on', next, rows, patch })
  }

  function commitWindow() {
    if (audit.evidence_from === before.evidence_from && audit.evidence_to === before.evidence_to) return
    updateAudit(audit.id, { evidence_from: audit.evidence_from, evidence_to: audit.evidence_to })
    const same = (f: FindingFull, a: Audit) => f.collected_from === a.evidence_from && f.collected_to === a.evidence_to
    const rows = findings.filter((f) => !same(f, audit)).map((f) => ({
      id: f.id, ref: f.ref, title: f.title,
      current: `${fmt(f.collected_from)} to ${fmt(f.collected_to)}`,
      preTick: same(f, before),
    }))
    if (rows.length) {
      setCascade({
        what: 'the evidence window',
        next: `${fmt(audit.evidence_from)} to ${fmt(audit.evidence_to)}`,
        rows,
        patch: { collected_from: audit.evidence_from, collected_to: audit.evidence_to },
      })
    }
  }

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 30 }}>
      {open && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--line)', padding: 16,
          width: 330, marginBottom: 8, boxShadow: '0 14px 40px rgba(25,26,62,.18)',
          maxHeight: '70vh', overflow: 'auto',
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
            <label>Started on</label>
            <input type="date" value={audit.started_on ?? ''}
              onFocus={() => setBefore(audit)}
              onChange={(e) => onChange({ ...audit, started_on: e.target.value || null })}
              onBlur={commitStart} />
            <div className="hint">Every new finding's Found on date starts here.</div>
          </div>
          <div className="fld">
            <label>Evidence window</label>
            <div className="two">
              <input type="date" aria-label="Evidence from" value={audit.evidence_from ?? ''}
                onFocus={() => setBefore(audit)}
                onChange={(e) => onChange({ ...audit, evidence_from: e.target.value || null })}
                onBlur={commitWindow} />
              <input type="date" aria-label="Evidence to" value={audit.evidence_to ?? ''}
                onFocus={() => setBefore(audit)}
                onChange={(e) => onChange({ ...audit, evidence_to: e.target.value || null })}
                onBlur={commitWindow} />
            </div>
            <div className="hint">The span the evidence covers. Every new finding starts with it.</div>
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
      {cascade && (
        <CascadeModal what={cascade.what} next={cascade.next} rows={cascade.rows}
          onClose={() => setCascade(null)}
          onApply={async (ids) => {
            await updateFindings(ids, cascade.patch)
            onFindings(ids, cascade.patch)
          }} />
      )}
    </div>
  )
}
