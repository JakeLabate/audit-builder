import { useMemo, useState } from 'react'
import type { Audit, AuditSource, Brand, ConfidenceLevel, FindingFull } from '../lib/types'
import type { AuditCheck } from '../lib/checks'
import { updateAudit, updateFindings } from '../lib/api'
import { registryOf } from '../lib/derive'
import { CascadeModal, type CascadeRow } from './Fields'
import {
  DEVICES, auditScopeOf, baselineText, kpisOf, newId, outOfScope, themesOf,
  type AuditScope, type Kpi, type Theme,
} from '../lib/overview'

/** The parts of the Overview, in the order they are shown. */
export const OVERVIEW_PARTS = [
  { id: 'brief', label: 'Brief' },
  { id: 'scope', label: 'Scope' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'summary', label: 'Summary' },
  { id: 'details', label: 'Details' },
] as const
export type OverviewPart = (typeof OVERVIEW_PARTS)[number]['id']

interface Props {
  audit: Audit
  brand: Brand
  brands: Brand[]
  findings: FindingFull[]
  checks: AuditCheck[]
  onChange: (a: Audit) => void
  onBrand: (b: Brand) => void
  onFindings: (ids: string[], patch: Partial<FindingFull>) => void
  onOpenFinding: (id: string) => void
  say: (msg: string) => void
}

/**
 * The audit's front page: what it is for, what it covers, where things stood
 * when it started, and what it concluded. Findings are the claims; this is
 * the frame they are read in.
 *
 * Text saves when the field is left, as everywhere else in the app. Lists
 * and choices save as they change.
 */
export default function Overview(props: Props) {
  const { audit, onChange, say } = props
  const [busy, setBusy] = useState(0)

  /** Change the page now; write later, when the field is left. */
  const local = (p: Partial<Audit>) => onChange({ ...audit, ...p })
  /** Write what the page already holds. */
  const commit = async (p: Partial<Audit>) => {
    setBusy((n) => n + 1)
    try {
      await updateAudit(audit.id, p)
    } catch (e) {
      say(`That did not save. ${(e as Error).message}`)
    } finally {
      setBusy((n) => n - 1)
    }
  }
  /** Change the page and write it at once. */
  const save = (p: Partial<Audit>) => {
    local(p)
    return commit(p)
  }

  const kit = { ...props, local, commit, save }
  return (
    <div className="ov">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 className="ttl" style={{ flex: 1 }}>Overview</h2>
        <span className="saving">{busy ? 'saving' : 'saved'}</span>
      </div>
      <p className="ov-lede">
        The frame the findings are read in: the question the audit answers, the numbers it is
        judged on and where they stood, what it covers, and what it concluded.
      </p>
      <Brief {...kit} />
      <ScopePart {...kit} />
      <Baseline {...kit} />
      <Summary {...kit} />
      <Details {...kit} />
    </div>
  )
}

type Kit = Props & {
  local: (p: Partial<Audit>) => void
  commit: (p: Partial<Audit>) => Promise<void>
  save: (p: Partial<Audit>) => Promise<void>
}

function Part({ id, title, purpose, children }: { id: OverviewPart; title: string; purpose: string; children: React.ReactNode }) {
  return (
    <section className="grp ov-part" id={`ov-${id}`}>
      <div className="grp-l">
        <h4>{title}</h4>
        <p className="purpose">{purpose}</p>
      </div>
      <div className="grp-b">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ brief */

function Brief({ audit, brand, local, commit, save }: Kit) {
  const kpis = kpisOf(audit)
  const reg = registryOf(brand)
  const setKpis = (next: Kpi[]) => local({ kpis: next })
  const edit = (id: string, p: Partial<Kpi>) => setKpis(kpis.map((k) => (k.id === id ? { ...k, ...p } : k)))
  return (
    <Part id="brief" title="Brief"
      purpose="Why the audit exists. Every finding's priority is read against this.">
      <div className="fld">
        <label>The question it answers</label>
        <textarea rows={2} value={audit.question ?? ''}
          placeholder="What is stopping Google from indexing the full product range?"
          onChange={(e) => local({ question: e.target.value })}
          onBlur={() => commit({ question: audit.question?.trim() || null })} />
      </div>
      <div className="fld">
        <label>Business objective</label>
        <textarea rows={2} value={audit.objective ?? ''}
          placeholder="The outcome the work is for, in the client's terms."
          onChange={(e) => local({ objective: e.target.value })}
          onBlur={() => commit({ objective: audit.objective?.trim() || null })} />
      </div>
      <div className="two">
        <div className="fld">
          <label>Commissioned by</label>
          <input value={audit.commissioned_by ?? ''} placeholder="Name, role"
            onChange={(e) => local({ commissioned_by: e.target.value })}
            onBlur={() => commit({ commissioned_by: audit.commissioned_by?.trim() || null })} />
        </div>
        <div className="fld">
          <label>Due on</label>
          <input type="date" value={audit.due_on ?? ''}
            onChange={(e) => save({ due_on: e.target.value || null })} />
        </div>
      </div>

      <div className="fld">
        <label>Judged on</label>
        <p className="hint">The two to four numbers that say whether the work paid off. A finding's Metric at risk can be picked from them, and their starting values go under Baseline.</p>
        {kpis.length > 0 && (
          <div className="ov-rows">
            {kpis.map((k) => (
              <div className="ov-row kpi" key={k.id}>
                <input aria-label="KPI" value={k.name} placeholder="Organic clicks" list="ov-metrics"
                  onChange={(e) => edit(k.id, { name: e.target.value })}
                  onBlur={() => commit({ kpis: kpisOf(audit) })} />
                <input aria-label="Unit" value={k.unit} placeholder="clicks per month" list="ov-units"
                  onChange={(e) => edit(k.id, { unit: e.target.value })}
                  onBlur={() => commit({ kpis: kpisOf(audit) })} />
                <button type="button" className="btn sm" aria-label={`Remove ${k.name || 'this KPI'}`}
                  onClick={() => save({ kpis: kpis.filter((x) => x.id !== k.id) })}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <datalist id="ov-metrics">{reg.metrics.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="ov-units">{reg.units.map((u) => <option key={u} value={u} />)}</datalist>
        <button type="button" className="btn sm"
          onClick={() => save({ kpis: [...kpis, { id: newId(), name: '', unit: '', baseline: null, as_of: null, source: null }] })}>
          Add a number
        </button>
      </div>
    </Part>
  )
}

/* ------------------------------------------------------------------ scope */

/** Toggles for the values a brand already uses, plus a box for any other. */
function ChipSet({ options, value, onChange, other }: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  other: string
}) {
  const [draft, setDraft] = useState('')
  const all = [...options, ...value.filter((v) => !options.includes(v))]
  const add = () => {
    const v = draft.trim()
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v])
    setDraft('')
  }
  return (
    <>
      {all.length > 0 && (
        <div className="chiprow">
          {all.map((o) => {
            const on = value.includes(o)
            return (
              <button key={o} type="button" className={`btn sm${on ? ' pri' : ''}`} aria-pressed={on}
                onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
                {o}
              </button>
            )
          })}
        </div>
      )}
      <div className="ov-add">
        <input value={draft} placeholder={other} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn sm" disabled={!draft.trim()} onClick={add}>Add</button>
      </div>
    </>
  )
}

/** One item per line. Kept as typed while focused, so a new line can be started. */
function Lines({ value, onSave, placeholder }: { value: string[]; onSave: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <textarea rows={Math.max(3, value.length + 1)} value={draft ?? value.join('\n')} placeholder={placeholder}
      onFocus={() => setDraft(value.join('\n'))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = (draft ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
        setDraft(null)
        if (next.join('\n') !== value.join('\n')) onSave(next)
      }} />
  )
}

function ScopePart({ audit, brand, findings, local, commit, save, onOpenFinding }: Kit) {
  const scope = auditScopeOf(audit)
  const reg = registryOf(brand)
  const set = (p: Partial<AuditScope>) => save({ scope: { ...scope, ...p } })
  const flagged = useMemo(
    () => findings.map((f) => ({ f, why: outOfScope(f, audit) })).filter((x) => x.why.length),
    [findings, audit])
  const domain = brand.domain?.trim()
  return (
    <Part id="scope" title="Scope"
      purpose="What the audit covers and what it leaves out. A finding outside it is flagged on the finding.">
      <div className="fld">
        <label>Domains</label>
        <p className="hint">A bare domain covers its subdomains. One typed with www covers only itself.</p>
        <ChipSet options={domain ? [domain] : []} value={scope.hosts} other="Another domain or subdomain"
          onChange={(hosts) => set({ hosts })} />
      </div>
      <div className="fld">
        <label>Markets</label>
        <ChipSet options={reg.markets} value={scope.markets} other="Another market"
          onChange={(markets) => set({ markets })} />
      </div>
      <div className="fld">
        <label>Page types</label>
        <ChipSet options={reg.templates.map((t) => t.name)} value={scope.templates} other="Another page type"
          onChange={(templates) => set({ templates })} />
      </div>
      <div className="fld">
        <label>Devices</label>
        <ChipSet options={DEVICES} value={scope.devices} other="Another device or surface"
          onChange={(devices) => set({ devices })} />
      </div>
      <div className="fld">
        <label>Left out</label>
        <p className="hint">One per line. Printed under Method and scope, so the client sees what was not looked at.</p>
        <Lines value={scope.excluded} placeholder={'The help centre subdomain\nPaid landing pages under /lp/'}
          onSave={(excluded) => set({ excluded })} />
      </div>
      <div className="fld">
        <label>Notes</label>
        <textarea rows={3} value={audit.scope_note ?? ''}
          placeholder="Anything the lists above do not say: what kind of review it was, which areas it went deep on."
          onChange={(e) => local({ scope_note: e.target.value })}
          onBlur={() => commit({ scope_note: audit.scope_note?.trim() || null })} />
      </div>
      {flagged.length > 0 && (
        <div className="issue">
          <b>{flagged.length === 1 ? '1 finding goes' : `${flagged.length} findings go`} beyond this scope</b>
          <ul className="ov-flags">
            {flagged.map(({ f, why }) => (
              <li key={f.id}>
                <button type="button" className="linkish" onClick={() => onOpenFinding(f.id)}>{f.ref}</button>
                {' '}{why.join('; ')}
              </li>
            ))}
          </ul>
          Widen the scope here, or narrow the finding.
        </div>
      )}
    </Part>
  )
}

/* --------------------------------------------------------------- baseline */

function Baseline({ audit, local, commit }: Kit) {
  const kpis = kpisOf(audit)
  const named = kpis.filter((k) => k.name.trim())
  const edit = (id: string, p: Partial<Kpi>) => local({ kpis: kpis.map((k) => (k.id === id ? { ...k, ...p } : k)) })
  const write = () => commit({ kpis: kpisOf(audit) })
  return (
    <Part id="baseline" title="Baseline"
      purpose="Where each number stood when the audit started. It is what outcomes and the checker are measured against.">
      {named.length === 0 ? (
        <p className="ov-none">Add the numbers the audit is judged on under Brief, then record where each one stood here.</p>
      ) : (
        <>
          <p className="hint">Typed from a report you can point to, with its date and source. Leave a value blank rather than estimate it.</p>
          <div className="ov-rows">
            {named.map((k) => (
              <div className="ov-base" key={k.id}>
                <div className="ov-base-n">
                  <b>{k.name}</b>
                  <span>{baselineText(k)}</span>
                </div>
                <div className="ov-base-f">
                  <div className="fld">
                    <label>Value{k.unit ? `, ${k.unit}` : ''}</label>
                    <input type="number" step="any" value={k.baseline ?? ''}
                      onChange={(e) => edit(k.id, { baseline: e.target.value === '' ? null : Number(e.target.value) })}
                      onBlur={write} />
                  </div>
                  <div className="fld">
                    <label>As of</label>
                    <input type="date" value={k.as_of ?? ''}
                      onChange={(e) => edit(k.id, { as_of: e.target.value || null })}
                      onBlur={write} />
                  </div>
                  <div className="fld wide">
                    <label>Source</label>
                    <input value={k.source ?? ''} placeholder="Google Search Console, Performance report, last 28 days"
                      onChange={(e) => edit(k.id, { source: e.target.value || null })}
                      onBlur={write} />
                  </div>
                </div>
                {k.baseline != null && (!k.as_of || !k.source?.trim()) && (
                  <p className="ov-warn">A value without {!k.as_of && !k.source?.trim() ? 'a date and a source' : !k.as_of ? 'a date' : 'a source'} cannot be checked later.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Part>
  )
}

/* ---------------------------------------------------------------- summary */

function Summary({ audit, findings, checks, local, commit, save, onOpenFinding }: Kit) {
  const themes = themesOf(audit)
  const byId = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings])
  const placed = new Set(themes.flatMap((t) => t.finding_ids).filter((id) => byId.has(id)))
  const loose = findings.filter((f) => !placed.has(f.id))
  const setThemes = (next: Theme[]) => save({ themes: next })
  const editLocal = (id: string, p: Partial<Theme>) => local({ themes: themes.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const writeThemes = () => commit({ themes: themesOf(audit) })

  // What was looked at and was fine. The checklist is the record of it.
  const passed = checks.filter((k) => k.status === 'pass')
  const na = checks.filter((k) => k.status === 'na').length
  const byCat = new Map<string, number>()
  for (const k of passed) {
    const c = k.path.split('/')[0] || 'Other'
    byCat.set(c, (byCat.get(c) ?? 0) + 1)
  }

  return (
    <Part id="summary" title="Summary"
      purpose="What the audit concluded across its findings. Printed at the top of What we found.">
      <div className="fld">
        <label>Executive summary</label>
        <p className="hint">Written for someone who reads only this. What is wrong, what it costs, what to do first.</p>
        <textarea rows={7} value={audit.summary ?? ''}
          onChange={(e) => local({ summary: e.target.value })}
          onBlur={() => commit({ summary: audit.summary?.trim() || null })} />
      </div>

      <div className="fld">
        <label>Themes</label>
        <p className="hint">The root causes the findings share. Each finding sits in one theme at most.</p>
        {themes.map((t) => {
          const members = t.finding_ids.map((id) => byId.get(id)).filter((f): f is FindingFull => Boolean(f))
          return (
            <div className="ov-theme" key={t.id}>
              <div className="ov-theme-h">
                <input aria-label="Theme" value={t.title} placeholder="Crawl budget spent on duplicates"
                  onChange={(e) => editLocal(t.id, { title: e.target.value })} onBlur={writeThemes} />
                <button type="button" className="btn sm" onClick={() => {
                  if (members.length && !confirm(`Remove the theme ${t.title || 'without a name'}? Its findings stay in the audit.`)) return
                  setThemes(themes.filter((x) => x.id !== t.id))
                }}>Remove</button>
              </div>
              <textarea rows={2} aria-label="What ties them together" value={t.note}
                placeholder="What ties these findings together, in a sentence or two."
                onChange={(e) => editLocal(t.id, { note: e.target.value })} onBlur={writeThemes} />
              <div className="chiprow ov-members">
                {members.map((f) => (
                  <span className="chip" key={f.id} title={f.title}>
                    <button type="button" className="linkish" onClick={() => onOpenFinding(f.id)}>{f.ref}</button>
                    <button type="button" aria-label={`Take ${f.ref} out of this theme`}
                      onClick={() => setThemes(themes.map((x) => (x.id === t.id ? { ...x, finding_ids: x.finding_ids.filter((id) => id !== f.id) } : x)))}>
                      &times;
                    </button>
                  </span>
                ))}
                {loose.length > 0 && (
                  <select className="ov-pick" value="" aria-label="Add a finding to this theme"
                    onChange={(e) => e.target.value && setThemes(themes.map((x) => (x.id === t.id ? { ...x, finding_ids: [...x.finding_ids, e.target.value] } : x)))}>
                    <option value="">Add a finding</option>
                    {loose.map((f) => <option key={f.id} value={f.id}>{f.ref} · {f.title || 'Untitled'}</option>)}
                  </select>
                )}
              </div>
            </div>
          )
        })}
        <button type="button" className="btn sm"
          onClick={() => setThemes([...themes, { id: newId(), title: '', note: '', finding_ids: [] }])}>
          Add a theme
        </button>
        {themes.length > 0 && findings.length > 0 && (
          <p className="ov-count">
            {loose.length === 0 ? 'Every finding is in a theme.'
              : `${loose.length} of ${findings.length} ${findings.length === 1 ? 'finding is' : 'findings are'} not in a theme yet.`}
          </p>
        )}
      </div>

      <div className="fld">
        <label>Checked and healthy</label>
        {checks.length === 0 ? (
          <p className="ov-none">No checklist on this audit, so nothing is on record as checked and found healthy. Add one on the Checklist tab.</p>
        ) : passed.length === 0 ? (
          <p className="ov-none">No check has passed yet.</p>
        ) : (
          <>
            <p className="ov-count">
              {passed.length} {passed.length === 1 ? 'check' : 'checks'} passed{na ? `, ${na} not applicable` : ''}.
            </p>
            <ul className="ov-cats">
              {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => <li key={c}><span>{c}</span><b>{n}</b></li>)}
            </ul>
          </>
        )}
      </div>
    </Part>
  )
}

/* ---------------------------------------------------------------- details */

const CONFIDENCE: ConfidenceLevel[] = ['high', 'medium', 'low']

/** Audit-level fields the document needs, which used to sit in a floating
 *  settings panel. Two dates here set defaults for every finding, so changing
 *  them offers to carry the change into the findings that still follow them. */
function Details({ audit, brands, findings, onBrand, onFindings, local, commit, save, brand }: Kit) {
  const [cascade, setCascade] = useState<{
    what: string; next: string; rows: CascadeRow[]; patch: Partial<FindingFull>
  } | null>(null)
  // What the audit held when the field was focused, so a cascade compares
  // findings against the old audit value rather than the half typed one.
  const [before, setBefore] = useState<Audit>(audit)
  const cycleDays = registryOf(brand).crawl_cycle_days
  const fmt = (d: string | null) => d ?? 'not set'
  const sources = (Array.isArray(audit.sources) ? audit.sources : []) as AuditSource[]
  const setSources = (next: AuditSource[]) => local({ sources: next })

  function commitStart() {
    if (audit.started_on === before.started_on || !audit.started_on) return
    void commit({ started_on: audit.started_on })
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
    void commit({ evidence_from: audit.evidence_from, evidence_to: audit.evidence_to })
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
    <Part id="details" title="Details"
      purpose="The audit's own record: its name, brand, status, dates, sources and what it could not see.">
      <div className="fld">
        <label>Audit title</label>
        <input value={audit.title}
          onChange={(e) => local({ title: e.target.value })}
          onBlur={() => commit({ title: audit.title })} />
      </div>
      <div className="two">
        <div className="fld">
          <label>Brand</label>
          <select value={audit.brand_id}
            onChange={async (e) => {
              const next = brands.find((b) => b.id === e.target.value)
              if (!next || next.id === audit.brand_id) return
              if (!confirm(`Move this audit to ${next.name}? Its report will be drawn with ${next.name}'s brand kit and registry.`)) return
              try {
                await updateAudit(audit.id, { brand_id: next.id })
                onBrand(next)
              } catch (err) {
                alert((err as Error).message)
              }
            }}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="hint">Moving it keeps every finding.</div>
        </div>
        <div className="fld">
          <label>Status</label>
          <select value={audit.status}
            onChange={(e) => save({ status: e.target.value as Audit['status'] })}>
            <option value="draft">Draft</option><option value="in_review">In review</option>
            <option value="delivered">Delivered</option><option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div className="two">
        <div className="fld">
          <label>Started on</label>
          <input type="date" value={audit.started_on ?? ''}
            onFocus={() => setBefore(audit)}
            onChange={(e) => local({ started_on: e.target.value || null })}
            onBlur={commitStart} />
          <div className="hint">Every new finding's Found on date starts here.</div>
        </div>
        <div className="fld">
          <label>URLs crawled</label>
          <input type="number" value={audit.urls_crawled ?? ''}
            onChange={(e) => local({ urls_crawled: e.target.value ? Number(e.target.value) : null })}
            onBlur={() => commit({ urls_crawled: audit.urls_crawled })} />
        </div>
      </div>
      <div className="fld">
        <label>Evidence window</label>
        <div className="two">
          <input type="date" aria-label="Evidence from" value={audit.evidence_from ?? ''}
            onFocus={() => setBefore(audit)}
            onChange={(e) => local({ evidence_from: e.target.value || null })}
            onBlur={commitWindow} />
          <input type="date" aria-label="Evidence to" value={audit.evidence_to ?? ''}
            onFocus={() => setBefore(audit)}
            onChange={(e) => local({ evidence_to: e.target.value || null })}
            onBlur={commitWindow} />
        </div>
        <div className="hint">The span the evidence covers. Every new finding starts with it.</div>
      </div>

      <div className="fld">
        <label>Sources</label>
        <p className="hint">The tools and data the audit is built from, with the window each covers. Printed under Method and scope.</p>
        {sources.length > 0 && (
          <div className="ov-rows">
            {sources.map((s, i) => (
              <div className="ov-row src" key={i}>
                <input aria-label="Tool or dataset" value={s.tool ?? ''} placeholder="Screaming Frog SEO Spider"
                  onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, tool: e.target.value } : x)))}
                  onBlur={() => commit({ sources })} />
                <input aria-label="Window" value={s.window ?? ''} placeholder="2026-08-11 to 2026-08-13"
                  onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, window: e.target.value } : x)))}
                  onBlur={() => commit({ sources })} />
                <select aria-label="Confidence" value={s.confidence ?? ''}
                  onChange={(e) => save({ sources: sources.map((x, j) => (j === i ? { ...x, confidence: e.target.value as ConfidenceLevel } : x)) })}>
                  <option value="">Confidence</option>
                  {CONFIDENCE.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                </select>
                <button type="button" className="btn sm" aria-label={`Remove ${s.tool || 'this source'}`}
                  onClick={() => save({ sources: sources.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn sm"
          onClick={() => save({ sources: [...sources, { tool: '', window: '', confidence: '' as ConfidenceLevel }] })}>
          Add a source
        </button>
      </div>

      <div className="fld">
        <label>What it could not see</label>
        <textarea value={audit.gaps ?? ''}
          onChange={(e) => local({ gaps: e.target.value })}
          onBlur={() => commit({ gaps: audit.gaps?.trim() || null })} />
        <div className="hint">What was not available. An audit missing log files says so upfront.</div>
      </div>

      {cascade && (
        <CascadeModal what={cascade.what} next={cascade.next} rows={cascade.rows}
          onClose={() => setCascade(null)}
          onApply={async (ids) => {
            await updateFindings(ids, cascade.patch)
            onFindings(ids, cascade.patch)
          }} />
      )}
    </Part>
  )
}
