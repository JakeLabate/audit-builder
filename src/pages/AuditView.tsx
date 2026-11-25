import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Deliverables, { DeliverablesRail } from '../components/Deliverables'
import { listExports, type ExportRow } from '../lib/exports'
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
import Checklist, { type CheckFilter } from '../components/Checklist'
import ChecklistBuilder, { type BuilderResult } from '../components/ChecklistBuilder'
import {
  coverage, coverageLine, groupByPath, sectionsWithCoverage, toSpec,
  type AuditCheck, type AuditTemplate, type CheckStatus,
} from '../lib/checks'
import { addChecks, createTemplate, deleteCheck, listChecks, listTemplates, updateCheck } from '../lib/checkdata'
import { isCategoryPath } from '../lib/taxonomy'
import { sourcesFrom } from '../lib/tools'
import { sectionsOf } from '../lib/sections'


export default function AuditView() {
  const { auditId } = useParams()
  const [audit, setAudit] = useState<Audit | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [findings, setFindings] = useState<FindingFull[]>([])
  // The checklist is optional, and so is everything that reads it: an audit
  // without one behaves exactly as it did before checklists existed.
  const [checks, setChecks] = useState<AuditCheck[]>([])
  const [view, setView] = useState<'findings' | 'checks'>('findings')
  const [cat, setCat] = useState<string | null>(null)
  const [ckFilter, setCkFilter] = useState<CheckFilter>('all')
  const [builder, setBuilder] = useState<{ templates: AuditTemplate[] } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null)
  const [exported, setExported] = useState(0)
  // What this audit has exported. Read here, not in the panel, because the
  // rail shows the count whether the panel is open or not.
  const [exportRows, setExportRows] = useState<ExportRow[] | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [dlvOpen, setDlvOpen] = useState(false)
  // Wide enough for the rail on the right. Below this the same panel is a
  // third tab in the list, so it is rendered in one place or the other.
  const wide = useWide()
  const dlvInList = dlvOpen && !wide
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
        // Never the reason an audit fails to open.
        setChecks(await listChecks(auditId).catch(() => []))
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
  // A phone cannot show the list and the editor side by side, so it shows one
  // at a time: the list first, then the finding that was tapped. The classes
  // only mean something under the phone breakpoint; a desktop shows both.
  const [mview, setMview] = useState<'list' | 'detail'>('list')
  const [metaOpen, setMetaOpen] = useState(false)
  // Where the list was scrolled to, so going back lands on the finding that
  // was just read instead of the top of the list.
  const listY = useRef(0)
  const phone = () => window.matchMedia('(max-width:760px)').matches
  const openFinding = (id: string) => {
    if (mview === 'list') listY.current = window.scrollY
    setSel(id)
    setMview('detail')
    if (phone()) window.scrollTo(0, 0)
  }
  const backToList = () => {
    setMview('list')
    if (phone()) requestAnimationFrame(() => window.scrollTo(0, listY.current))
  }

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

  const loadExports = useCallback(async () => {
    if (!auditId) return
    try {
      setExportRows(await listExports(auditId))
      setExportErr(null)
    } catch (e) {
      setExportErr(`The exports could not be read. ${(e as Error).message}`)
    }
  }, [auditId])
  useEffect(() => { void loadExports() }, [loadExports, exported])

  // Escape closes the panel, unless a dialog is open on top of it: that one
  // gets the key first.
  useEffect(() => {
    if (!dlvOpen || ex || builder) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDlvOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dlvOpen, ex, builder])

  const cov = useMemo(() => coverage(checks), [checks])
  const checkGroups = useMemo(() => groupByPath(checks), [checks])

  const switchView = (v: 'findings' | 'checks') => {
    setView(v)
    // On a narrow screen Deliverables is one of these tabs, so picking
    // another leaves it. On a wide one it is its own panel and stays put.
    if (!wide) setDlvOpen(false)
    setMview('list')
    if (phone()) window.scrollTo(0, 0)
  }
  const openCategory = (c: string | null) => {
    if (mview === 'list') listY.current = window.scrollY
    setCat(c)
    setMview('detail')
    if (phone()) window.scrollTo(0, 0)
  }
  const patchCheck = (id: string, p: Partial<AuditCheck>) =>
    setChecks((all) => all.map((k) => (k.id === id ? { ...k, ...p } : k)))

  /** Pressing the answer a check already has clears it. */
  async function setCheckStatus(k: AuditCheck, pressed: CheckStatus) {
    const next: CheckStatus = k.status === pressed ? 'todo' : pressed
    const patch: Partial<AuditCheck> = { status: next }
    if (k.finding_id && next !== 'fail') {
      const f = findings.find((x) => x.id === k.finding_id)
      if (!confirm(`This check raised ${f?.ref ?? 'a finding'}. Changing the result keeps that finding in the audit but unlinks it from this check. Continue?`)) return
      patch.finding_id = null
    }
    patchCheck(k.id, patch)
    try {
      await updateCheck(k.id, patch)
    } catch (e) {
      patchCheck(k.id, { status: k.status, finding_id: k.finding_id })
      say(`That did not save. ${(e as Error).message}`)
    }
  }

  async function setCheckNote(k: AuditCheck, note: string) {
    patchCheck(k.id, { note: note || null })
    try {
      await updateCheck(k.id, { note: note || null })
    } catch (e) {
      patchCheck(k.id, { note: k.note })
      say(`The note did not save. ${(e as Error).message}`)
    }
  }

  /**
   * A failed check becomes a finding. The check supplies what it knows: the
   * category, which issues the reference, and the first measurement row. The
   * claim is typed by the person who looked.
   */
  async function raiseFinding(k: AuditCheck, title: string) {
    if (!audit) return
    const path = isCategoryPath(k.path) ? k.path : null
    const ref = await nextRef(audit.id, path)
    const measurements = [{ check: k.title, tool: k.tool, result: k.note ?? '' }]
    const f = await createFinding(audit.org_id, audit.id, ref, title, findings.length, {
      raised: audit.started_on ?? undefined,
      collected_from: audit.evidence_from,
      collected_to: audit.evidence_to,
      pillar: path ?? undefined,
      measurements,
      source: sourcesFrom(measurements),
    })
    setFindings((p) => withBands([...p, f]))
    try {
      await updateCheck(k.id, { finding_id: f.id, status: 'fail' })
      patchCheck(k.id, { finding_id: f.id, status: 'fail' })
    } catch (e) {
      // The finding exists and is in the list; only the link is missing.
      throw new Error(`The finding was created as ${f.ref} but could not be linked to this check. ${(e as Error).message}`)
    }
  }

  async function removeCheck(k: AuditCheck) {
    setChecks((all) => all.filter((x) => x.id !== k.id))
    try {
      await deleteCheck(k.id)
    } catch (e) {
      setChecks((all) => [...all, k].sort((a, b) => a.position - b.position))
      say(`That check could not be removed. ${(e as Error).message}`)
    }
  }

  async function openBuilder() {
    setBuilder({ templates: await listTemplates().catch(() => []) })
  }

  async function addFromBuilder(r: BuilderResult) {
    if (!audit) return
    const first = checks.length === 0
    const startAt = checks.reduce((m, k) => Math.max(m, k.position + 1), 0)
    const added = await addChecks(audit.org_id, audit.id, r.specs, startAt)
    setChecks((all) => [...all, ...added])
    // The first checklist on an audit names it and switches its page on in
    // the document. Later additions leave both alone.
    if (first) {
      const patch = {
        checklist_name: r.baseName,
        sections: sectionsWithCoverage(sectionsOf(audit)),
      } as Partial<Audit>
      await updateAudit(audit.id, patch).catch(() => undefined)
      setAudit({ ...audit, ...patch })
    }
    setBuilder(null)
    say(`${added.length} ${added.length === 1 ? 'check' : 'checks'} added.`)
  }

  async function saveAsTemplate(name: string) {
    if (!audit) return
    await createTemplate(audit.org_id, name, checks.map(toSpec))
  }

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
    openFinding(f.id)
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
      <div className="top crumbbar">
        <div className="crumbs">
          <Link to="/">Brands</Link><span>/</span>
          <Link to={`/brand/${brand.id}`}>{brand.name}</Link><span>/</span>
          <b>{audit.title}</b>
          <span className={'modetag ' + audit.mode}>
            {audit.mode === 'logic' ? 'Logic' : 'Manual'}
          </span>
        </div>
        <span className="grow" />
        <button className="btn sm m-only" onClick={() => setMetaOpen((v) => !v)}>Settings</button>
        <button className="btn sm pri" onClick={openExport}>Export</button>
      </div>

      {/* Phones only: the way back to the list, and a step to the next finding
          without going back first. */}
      {view === 'checks' && mview === 'detail' && (
        <div className="mnav">
          <button className="mnav-back" onClick={backToList}>
            <span aria-hidden="true">&lsaquo;</span> Checklist
          </button>
          <span className="mnav-n">{cat ?? 'All checks'}</span>
        </div>
      )}
      {view === 'findings' && mview === 'detail' && current && (() => {
        const i = shown.findIndex((f) => f.id === current.id)
        return (
          <div className="mnav">
            <button className="mnav-back" onClick={backToList}>
              <span aria-hidden="true">&lsaquo;</span> Findings
            </button>
            <span className="mnav-n">{i >= 0 ? `${i + 1} of ${shown.length}` : ''}</span>
            <button className="mnav-step" aria-label="Previous finding" disabled={i <= 0}
              onClick={() => openFinding(shown[i - 1].id)}>&lsaquo;</button>
            <button className="mnav-step" aria-label="Next finding" disabled={i < 0 || i >= shown.length - 1}
              onClick={() => openFinding(shown[i + 1].id)}>&rsaquo;</button>
          </div>
        )
      })()}

      <div className={`split has-rail m-${mview}${dlvOpen ? ' dlv-open' : ''}`}>
        <div className="list">
          <div className="listbar">
            <div className="vtabs" role="tablist" aria-label="Audit views">
              <button role="tab" aria-selected={!dlvInList && view === 'findings'}
                className={'vtab' + (!dlvInList && view === 'findings' ? ' on' : '')}
                onClick={() => switchView('findings')}>
                Findings <b>{findings.length}</b>
              </button>
              <button role="tab" aria-selected={!dlvInList && view === 'checks'}
                className={'vtab' + (!dlvInList && view === 'checks' ? ' on' : '')}
                onClick={() => switchView('checks')}>
                Checklist {cov.total > 0 && <b>{cov.checked}/{cov.total}</b>}
              </button>
              <button role="tab" aria-selected={dlvInList} className={'vtab narrow' + (dlvInList ? ' on' : '')}
                onClick={() => { setDlvOpen(true); setMview('list'); if (phone()) window.scrollTo(0, 0) }}>
                Deliverables {!!exportRows?.length && <b>{exportRows.length}</b>}
              </button>
            </div>
            {!dlvInList && view === 'findings' && (
              <>
                <input placeholder="Filter findings" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn sm pri" onClick={add}>New</button>
              </>
            )}
          </div>

          {dlvInList && (
            <Deliverables rows={exportRows} error={exportErr} onChanged={loadExports}
              onClose={() => setDlvOpen(false)} onExport={openExport} />
          )}

          {!dlvInList && view === 'checks' && (cov.total === 0 ? (
            <div className="list-empty">
              No checklist on this audit. It is optional.
              <div style={{ marginTop: 12 }}>
                <button className="btn sm pri" onClick={openBuilder}>Add a checklist</button>
              </div>
            </div>
          ) : (
            <>
              <div className="stagesum">
                {([['all', 'All', cov.total], ['todo', 'To do', cov.todo], ['fail', 'Failed', cov.fail]] as [CheckFilter, string, number][])
                  .map(([f, label, n]) => (
                    <button key={f} className={`stg-chip${ckFilter === f ? ' on' : ''}`} aria-pressed={ckFilter === f}
                      onClick={() => setCkFilter(f)}>
                      {label} <b>{n}</b>
                    </button>
                  ))}
              </div>
              <div className="frow crow" aria-selected={cat === null} onClick={() => openCategory(null)}>
                <span className="nm">All checks<span>{coverageLine(cov)}</span></span>
                <span className={`pill ${cov.todo === 0 ? 'done' : 'none'}`}>{cov.checked}/{cov.total}</span>
              </div>
              {checkGroups.map((g) => {
                const c = coverage(g.subs.flatMap((s) => s.items))
                return (
                  <div className="frow crow" key={g.category} aria-selected={cat === g.category}
                    onClick={() => openCategory(g.category)}>
                    <span className="nm">{g.category}
                      <span>{c.checked} of {c.total} checked{c.fail ? ` · ${c.fail} failed` : ''}</span>
                    </span>
                    <span className={`pill ${c.todo === 0 ? 'done' : 'none'}`}>{c.checked}/{c.total}</span>
                  </div>
                )
              })}
            </>
          ))}

          {!dlvInList && view === 'findings' && (<>
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
              <div className="frow" key={f.id} aria-selected={f.id === sel} onClick={() => openFinding(f.id)}>
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
          </>)}
        </div>

        <div className="pane">
          {view === 'checks' ? (
            <Checklist
              audit={audit}
              checks={checks}
              findings={findings}
              category={cat}
              filter={ckFilter}
              onStatus={setCheckStatus}
              onNote={setCheckNote}
              onRaise={raiseFinding}
              onRemove={removeCheck}
              onOpenFinding={(id) => { setView('findings'); openFinding(id) }}
              onAdd={openBuilder}
              onSaveTemplate={saveAsTemplate}
            />
          ) : current ? (
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
                  // The database unlinks the check; the page has to as well.
                  setChecks((all) => all.map((k) => (k.finding_id === current.id ? { ...k, finding_id: null } : k)))
                  setSel(null)
                  setMview('list')
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

        {/* Wide screens: a rail down the right edge, the full height of the
            workspace, and the panel it opens beside it. Narrow ones have no
            room for a rail, so the same panel is a third tab in the list. */}
        <DeliverablesRail count={exportRows?.length ?? null} open={dlvOpen}
          onToggle={() => setDlvOpen((v) => !v)} />
        {dlvOpen && wide && (
          <aside className="dlv-side">
            <Deliverables rows={exportRows} error={exportErr} onChanged={loadExports}
              onClose={() => setDlvOpen(false)} onExport={openExport} />
          </aside>
        )}
      </div>

      {ex && brand && (
        <ExportModal
          audit={audit}
          brand={brand}
          findings={findings}
          checks={checks}
          byline={ex.byline}
          logoUrl={ex.logoUrl}
          sheetsReady={sheetsConfigured()}
          onChange={setAudit}
          onClose={() => setEx(null)}
          say={say}
          onExported={() => setExported((n) => n + 1)}
        />
      )}

      {builder && (
        <ChecklistBuilder
          mode="add"
          templates={builder.templates}
          have={checks.map(toSpec)}
          onClose={() => setBuilder(null)}
          onDone={addFromBuilder}
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
        open={metaOpen} setOpen={setMetaOpen}
        cycleDays={registryOf(brand).crawl_cycle_days}
        onFindings={(ids, patch) => setFindings((p) => withBands(p.map((x) => (ids.includes(x.id) ? { ...x, ...patch } : x))))} />
    </>
  )
}

/** True while the window is wide enough for the audit's side rail. */
function useWide(): boolean {
  const query = '(min-width:961px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** Audit-level fields the document needs but the finding list does not show. */
function AuditMeta({
  audit, findings, onChange, onFindings, cycleDays, open, setOpen,
}: {
  open: boolean
  setOpen: (fn: (v: boolean) => boolean) => void
  audit: Audit
  findings: FindingFull[]
  cycleDays: number
  onChange: (a: Audit) => void
  onFindings: (ids: string[], patch: Partial<FindingFull>) => void
}) {
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
    <div className="am">
      {open && (
        <div className="am-panel">
          <div className="am-hd m-only">
            <b>Audit settings</b>
            <button className="modal-x" aria-label="Close audit settings" onClick={() => setOpen(() => false)}>&times;</button>
          </div>
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
      <button className="btn am-fab" onClick={() => setOpen((v) => !v)}>
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
