import { useEffect, useMemo, useState } from 'react'
import type { Brand, FindingFull, Measurement } from '../lib/types'
import { TAXONOMY, isCategoryPath } from '../lib/taxonomy'
import {
  addWorkspaceTool, listWorkspaceTools, nearestTool, toolGroups, toolPath, type WorkspaceTool,
} from '../lib/tools'
import {
  parseUrls, SEGMENT_LABEL, templatesOf, urlsAffected, type Scope, type Segment, type SegmentType,
} from '../lib/scope'
import { registryOf } from '../lib/derive'
import { updateBrand, uploadUrlList } from '../lib/api'

/* --------------------------------------------------------------- category */

/** The universal taxonomy as a nested dropdown. A legacy free-text pillar is
 *  shown as it was until someone picks a category for it. */
export function CategoryPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const legacy = value && !isCategoryPath(value) ? value : null
  return (
    <select value={isCategoryPath(value) ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
      <option value="">{legacy ? `${legacy} (pick a category)` : 'Pick a category'}</option>
      {TAXONOMY.map((t) => (
        <optgroup key={t.category} label={t.category}>
          {t.subcategories.map((s) => (
            <option key={s} value={`${t.category}/${s}`}>{s}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/* ------------------------------------------------------------------ scope */

const TYPES: SegmentType[] = ['template', 'component', 'pages', 'sitewide']

/**
 * Segments, markets and the optional URL list. Writes the scope, and keeps
 * urls_affected and templates in step with it, in one change.
 */
export function ScopeEditor({
  finding, brand, onChange, onBrand,
}: {
  finding: FindingFull
  brand: Brand | null
  onChange: (p: { scope: Scope; urls_affected: number | null; templates: string[]; markets?: string[] }) => void
  onBrand?: (b: Brand) => void
}) {
  const scope = finding.scope
  const reg = registryOf(brand)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<{ i: number; kind: 'templates' | 'components'; name: string } | null>(null)

  const emit = (next: Scope, uploaded: string[] | null = null) =>
    onChange({ scope: next, urls_affected: urlsAffected(next, uploaded), templates: templatesOf(next) })

  const setSeg = (i: number, p: Partial<Segment>) =>
    emit({ ...scope, segments: scope.segments.map((s, j) => (j === i ? { ...s, ...p } : s)) })

  const names = (kind: 'templates' | 'components') => reg[kind].map((t) => t.name)

  async function saveNew() {
    if (!adding || !brand) return
    const name = adding.name.trim()
    if (!name) { setErr('Name it first'); return }
    if (names(adding.kind).some((n) => n.toLowerCase() === name.toLowerCase())) {
      setErr('That one is already in the list'); return
    }
    const registry = { ...(brand.registry ?? {}), [adding.kind]: [...reg[adding.kind], { name }] }
    await updateBrand(brand.id, { registry })
    onBrand?.({ ...brand, registry })
    setSeg(adding.i, { name })
    setAdding(null); setErr(null)
  }

  async function upload(file: File) {
    setErr(null)
    const urls = parseUrls(await file.text())
    if (urls.length === 0) { setErr('No URLs found in that file'); return }
    setBusy(true)
    try {
      const path = await uploadUrlList(finding.org_id, finding.id, urls)
      emit({ ...scope, url_list: { path, count: urls.length, name: file.name, uploaded_at: new Date().toISOString() } }, urls)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const markets = reg.markets
  const allOn = markets.length > 0 && markets.every((m) => finding.markets.includes(m))

  // A single-market brand never asks: the one market fills itself.
  useEffect(() => {
    if (markets.length === 1 && finding.markets.join() !== markets[0]) {
      onChange({ scope, urls_affected: finding.urls_affected, templates: finding.templates, markets: [markets[0]] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding.id, markets.join()])

  return (
    <>
      <div className="fld">
        <label>Segments</label>
        <p className="hint">Which page types have the problem. Pick Sitewide if they all do.</p>
        {scope.segments.map((s, i) => (
          <div key={i} className="seg">
            <select value={s.type} onChange={(e) => setSeg(i, { type: e.target.value as SegmentType, name: undefined, urls: undefined })}>
              {TYPES.map((t) => <option key={t} value={t}>{SEGMENT_LABEL[t]}</option>)}
            </select>
            {(s.type === 'template' || s.type === 'component') && (() => {
              const kind = s.type === 'template' ? 'templates' : 'components'
              const list = names(kind)
              return adding?.i === i ? (
                <div className="seg-add">
                  <input autoFocus value={adding.name} placeholder={s.type === 'template' ? 'Product detail' : 'FAQ accordion'}
                    onChange={(e) => { setAdding({ ...adding, name: e.target.value }); setErr(null) }} />
                  <button className="btn sm" onClick={() => { setAdding(null); setErr(null) }}>Cancel</button>
                  <button className="btn sm pri" onClick={saveNew}>Save</button>
                </div>
              ) : (
                <select value={s.name ?? ''} onChange={(e) => {
                  if (e.target.value === '__add') setAdding({ i, kind, name: '' })
                  else setSeg(i, { name: e.target.value || undefined })
                }}>
                  <option value="">Pick a {s.type}</option>
                  {list.map((n) => <option key={n} value={n}>{n}</option>)}
                  {brand && <option value="__add">+ Add a {s.type}</option>}
                </select>
              )
            })()}
            {s.type === 'pages' && (
              <textarea rows={2} value={(s.urls ?? []).join('\n')} placeholder="https://www.example.com/pricing"
                onChange={(e) => setSeg(i, { urls: e.target.value.split('\n').map((u) => u.trim()).filter(Boolean) })} />
            )}
            {s.type === 'sitewide' && <span className="seg-note">Every page</span>}
            <button className="btn sm danger" aria-label="Remove segment"
              onClick={() => emit({ ...scope, segments: scope.segments.filter((_, j) => j !== i) })}>x</button>
          </div>
        ))}
        <button className="btn sm" onClick={() => emit({ ...scope, segments: [...scope.segments, { type: 'template' }] })}>
          Add segment
        </button>
      </div>

      {markets.length > 1 && (
        <div className="fld">
          <label>Markets</label>
          <p className="hint">Which country or language sites have it.</p>
          <div className="chiprow">
            <button type="button" className={`btn sm${allOn ? ' pri' : ''}`}
              onClick={() => onChange({ scope, urls_affected: finding.urls_affected, templates: finding.templates, markets: allOn ? [] : [...markets] })}>
              All markets
            </button>
            {markets.map((m) => {
              const on = finding.markets.includes(m)
              return (
                <button key={m} type="button" className={`btn sm${on ? ' pri' : ''}`}
                  onClick={() => onChange({
                    scope, urls_affected: finding.urls_affected, templates: finding.templates,
                    markets: on ? finding.markets.filter((x) => x !== m) : markets.filter((x) => x === m || finding.markets.includes(x)),
                  })}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="fld">
        <label>URL list <span className="opt">optional</span></label>
        <p className="hint">Upload the affected URLs to count them and remove duplicates.</p>
        {scope.url_list ? (
          <div className="seg">
            <span className="seg-note">{scope.url_list.name} · {scope.url_list.count.toLocaleString('en-US')} unique URLs</span>
            <button className="btn sm danger" onClick={() => emit({ ...scope, url_list: null })}>Remove</button>
          </div>
        ) : (
          <input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={busy}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = '' }} />
        )}
        {err && <p className="ferr">{err}</p>}
      </div>

      <div className="fld">
        <label>URLs affected</label>
        <div className="ro">
          {finding.urls_affected != null
            ? finding.urls_affected.toLocaleString('en-US')
            : 'Not counted. Upload a URL list, or list the pages, to count it.'}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ measurements */

let toolCache: Promise<WorkspaceTool[]> | null = null
function useWorkspaceTools(): [WorkspaceTool[], (t: WorkspaceTool) => void] {
  const [tools, setTools] = useState<WorkspaceTool[]>([])
  useEffect(() => {
    let live = true
    toolCache ??= listWorkspaceTools().catch(() => [])
    toolCache.then((t) => { if (live) setTools(t) })
    return () => { live = false }
  }, [])
  const add = (t: WorkspaceTool) => {
    setTools((p) => [...p, t])
    toolCache = Promise.resolve([...tools, t])
  }
  return [tools, add]
}

/** Check, Tool, Result. Sources are worked out from the tools, by the caller. */
export function MeasurementsEditor({
  value, orgId, onChange,
}: { value: Measurement[]; orgId: string; onChange: (v: Measurement[]) => void }) {
  const [mine, addMine] = useWorkspaceTools()
  const groups = useMemo(() => toolGroups(mine), [mine])
  const [adding, setAdding] = useState<{ i: number; parent: string; name: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const edit = (i: number, p: Partial<Measurement>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const near = adding ? nearestTool(adding.name, mine) : null

  async function save() {
    if (!adding) return
    const name = adding.name.trim()
    if (!name) { setErr('Name the tool or report'); return }
    const parent = adding.parent === '__new' ? name : adding.parent
    const report = adding.parent === '__new' ? 'General' : name
    const path = toolPath(parent, report)
    if (groups.some((g) => g.items.some((it) => it.path === path))) { setErr('That one is already in the list'); return }
    try {
      const t = await addWorkspaceTool(orgId, parent, report)
      addMine(t)
      edit(adding.i, { tool: path })
      setAdding(null); setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="fld">
      <label>Measurements</label>
      <p className="hint">Each check you ran: what, which tool, and what came back.</p>
      {value.map((m, i) => (
        <div key={i} className="mrow">
          <input value={m.check} placeholder="What you looked at, specific enough to repeat"
            onChange={(e) => edit(i, { check: e.target.value })} />
          <select value={m.tool ?? ''} onChange={(e) => {
            if (e.target.value === '__add') { setAdding({ i, parent: '__new', name: '' }); setErr(null) }
            else edit(i, { tool: e.target.value || null })
          }}>
            <option value="">Pick a tool</option>
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((it) => <option key={it.path} value={it.path}>{it.name}{it.yours ? ' · yours' : ''}</option>)}
              </optgroup>
            ))}
            <optgroup label="Not listed"><option value="__add">+ Add a tool</option></optgroup>
          </select>
          <input value={m.result} placeholder="What came back, with its unit"
            onChange={(e) => edit(i, { result: e.target.value })} />
          <button className="btn sm danger" aria-label="Remove measurement"
            onClick={() => onChange(value.filter((_, j) => j !== i))}>x</button>
          {adding?.i === i && (
            <div className="tooladd">
              <b>New tool for your workspace</b>
              <span className="hint">Saved for everyone in your workspace, in every audit.</span>
              <select value={adding.parent} onChange={(e) => setAdding({ ...adding, parent: e.target.value })}>
                <option value="__new">A new tool</option>
                {groups.map((g) => <option key={g.group} value={g.group}>A report in {g.group}</option>)}
              </select>
              <input autoFocus value={adding.name} placeholder="Sitebulb"
                onChange={(e) => { setAdding({ ...adding, name: e.target.value }); setErr(null) }} />
              {near && <span className="fwarn">Close to {near}, which is already listed.</span>}
              {err && <span className="ferr">{err}</span>}
              <div className="tooladd-b">
                <button className="btn sm" onClick={() => { setAdding(null); setErr(null) }}>Cancel</button>
                <button className="btn sm pri" onClick={save}>Save tool</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...value, { check: '', tool: null, result: '' }])}>
        Add measurement
      </button>
    </div>
  )
}

/* --------------------------------------------------------- evidence window */

const fmt = (d: string | null) =>
  d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null

/** One line, defaulted from the audit, with an override. */
export function EvidenceWindow({
  from, to, onChange,
}: { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const backwards = !!(from && to && from > to)
  return (
    <div className="fld">
      <label>Evidence window</label>
      {!open ? (
        <div className="ro">
          {from || to ? `${fmt(from) ?? 'Not set'} to ${fmt(to) ?? 'Not set'}` : 'Not set on the audit yet'}
          <button className="btn sm ghost" onClick={() => setOpen(true)}>Change</button>
        </div>
      ) : (
        <div className="two">
          <input type="date" aria-label="Evidence from" value={from ?? ''} onChange={(e) => onChange(e.target.value || null, to)} />
          <input type="date" aria-label="Evidence to" value={to ?? ''} onChange={(e) => onChange(from, e.target.value || null)} />
        </div>
      )}
      {backwards && <p className="ferr">The start is after the end.</p>}
    </div>
  )
}

/* ----------------------------------------------------- audit date cascade */

export interface CascadeRow { id: string; ref: string; title: string; current: string; preTick: boolean }

/**
 * Shown when an audit-level date changes. Lists every finding the new date
 * would change; findings still on the old audit date come ticked, findings
 * with a date of their own come unticked.
 */
export function CascadeModal({
  what, next, rows, onApply, onClose,
}: {
  what: string
  next: string
  rows: CascadeRow[]
  onApply: (ids: string[]) => Promise<void>
  onClose: () => void
}) {
  const [on, setOn] = useState<Set<string>>(() => new Set(rows.filter((r) => r.preTick).map((r) => r.id)))
  const [busy, setBusy] = useState(false)
  const run = async (ids: string[]) => { setBusy(true); try { await onApply(ids) } finally { setBusy(false); onClose() } }
  const flip = (id: string) => setOn((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal cascade" role="dialog" aria-modal="true" aria-label={`Update ${what}`}>
        <header className="modal-hd">
          <b>Update {what} on findings?</b>
          <button className="modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </header>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          {rows.length} finding{rows.length === 1 ? '' : 's'} would change to {next}. Ticked ones are still on the old audit date.
        </p>
        <div className="cascade-list">
          {rows.map((r) => (
            <label key={r.id} className="cascade-row">
              <input type="checkbox" checked={on.has(r.id)} onChange={() => flip(r.id)} />
              <span className="mono">{r.ref}</span>
              <span className="nm">{r.title || 'Untitled'}</span>
              <span className="mono when">{r.current}</span>
            </label>
          ))}
        </div>
        <div className="cascade-b">
          <button className="btn" disabled={busy} onClick={onClose}>Leave findings as they are</button>
          <button className="btn" disabled={busy || on.size === 0} onClick={() => run([...on])}>Update ticked ({on.size})</button>
          <button className="btn pri" disabled={busy} onClick={() => run(rows.map((r) => r.id))}>Update all</button>
        </div>
      </div>
    </div>
  )
}

/**
 * A comma separated list typed into one box. The box keeps what was typed
 * while it has focus, so a trailing comma or space survives long enough to
 * type the next item; the parsed list is what gets saved.
 */
export function ListInput({ value, onChange, placeholder }: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parse = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  return (
    <input value={draft ?? value.join(', ')} placeholder={placeholder}
      onFocus={() => setDraft(value.join(', '))}
      onChange={(e) => { setDraft(e.target.value); onChange(parse(e.target.value)) }}
      onBlur={() => setDraft(null)} />
  )
}
