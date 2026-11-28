import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DEFAULT_KIND } from '../lib/kind'
import { createAudit, deleteAudit, listAudits, listBrands } from '../lib/api'
import type { Audit, AuditMode, AuditStatus, Brand } from '../lib/types'
import ChecklistBuilder, { type BuilderResult } from '../components/ChecklistBuilder'
import { PRESETS, nameFor, presetRef, specsFor, type AuditTemplate } from '../lib/checks'
import { createAuditWithChecks, createTemplate, listTemplates } from '../lib/checkdata'

const STATUS_LABEL: Record<AuditStatus, string> = {
  draft: 'Draft', in_review: 'In review', delivered: 'Delivered', archived: 'Archived',
}

/**
 * Every audit in the workspace, whatever brand it is for.
 *
 * Audits are managed here and brands on the Brands tab. An audit still
 * belongs to one brand, since the brand is what the report is drawn with, so
 * a new audit picks one and the list can be narrowed to one. The filters live
 * in the address, so a link to one brand's audits works.
 */
export default function Audits() {
  const [params, setParams] = useSearchParams()
  const brandFilter = params.get('brand') ?? ''
  const statusFilter = (params.get('status') ?? '') as AuditStatus | ''
  const [q, setQ] = useState('')

  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [audits, setAudits] = useState<Audit[]>([])
  const [templates, setTemplates] = useState<AuditTemplate[]>([])
  const [err, setErr] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [brandId, setBrandId] = useState('')
  const [title, setTitle] = useState(DEFAULT_KIND)
  const [mode, setMode] = useState<AuditMode>('manual')
  // Empty means no checklist, which is an audit exactly as it has always been.
  const [checklist, setChecklist] = useState('')
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [b, a] = await Promise.all([listBrands(), listAudits()])
        setBrands(b)
        setAudits(a)
        // Templates are optional. Not having any, or not being able to read
        // them, never stops the page.
        setTemplates(await listTemplates().catch(() => []))
      } catch (e) {
        setErr((e as Error).message)
        setBrands([])
      }
    })()
  }, [])

  const byId = useMemo(() => new Map((brands ?? []).map((b) => [b.id, b])), [brands])

  // ?new=1, from a brand's page: open the form with that brand picked.
  useEffect(() => {
    if (!brands || params.get('new') !== '1') return
    openNew()
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands])

  function setFilter(key: 'brand' | 'status', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function openNew() {
    // The brand in view is the likeliest one; with a single brand there is
    // nothing to choose.
    setBrandId(brandFilter && byId.has(brandFilter) ? brandFilter : brands?.length === 1 ? brands[0].id : '')
    setAdding(true)
  }

  const chosen = byId.get(brandId) ?? null

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen || !title.trim()) return
    try {
      const specs = specsFor(checklist || null, templates)
      const a = specs.length
        ? await createAuditWithChecks(chosen.org_id, chosen.id, title.trim(), mode, nameFor(checklist, templates), specs)
        : await createAudit(chosen.org_id, chosen.id, title.trim(), mode)
      setAudits((p) => [a, ...p])
      setAdding(false)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  /** The audit, from a checklist picked check by check. Errors go back to the
   *  dialog, which is still open and is where the person is looking. */
  async function addCustom(r: BuilderResult) {
    if (!chosen) return
    const name = title.trim() || DEFAULT_KIND
    let saved: AuditTemplate | null = null
    if (r.saveAs) {
      saved = await createTemplate(chosen.org_id, r.saveAs, r.specs)
      setTemplates((p) => [...p, saved!].sort((a, b) => a.name.localeCompare(b.name)))
    }
    const a = await createAuditWithChecks(
      chosen.org_id, chosen.id, name, mode, saved?.name ?? r.baseName ?? 'Custom', r.specs)
    setAudits((p) => [a, ...p])
    if (saved) setChecklist(saved.id)
    setBuilding(false)
    setAdding(false)
    setErr(null)
  }

  async function remove(a: Audit) {
    if (!confirm(`Delete ${a.title} and every finding in it?`)) return
    try {
      await deleteAudit(a.id)
      setAudits((p) => p.filter((x) => x.id !== a.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (!brands) return <div className="wrap"><span className="saving">Loading</span></div>

  const needle = q.trim().toLowerCase()
  const shown = audits.filter((a) =>
    (!brandFilter || a.brand_id === brandFilter)
    && (!statusFilter || a.status === statusFilter)
    && (!needle || a.title.toLowerCase().includes(needle)
      || (byId.get(a.brand_id)?.name ?? '').toLowerCase().includes(needle)))
  const filtered = Boolean(brandFilter || statusFilter || needle)

  return (
    <div className="wrap">
      <h1 className="page">Audits</h1>
      <p className="sub">
        Every audit in the workspace. Each one is for a brand, which is what its report is drawn
        with; findings live under the audit.
      </p>

      {err && <div className="issue"><b>Something went wrong</b>{err}</div>}

      <div className="bar">
        <button className="btn pri" onClick={() => (adding ? setAdding(false) : openNew())}
          disabled={brands.length === 0}>
          {adding ? 'Cancel' : 'New audit'}
        </button>
        <select className="ctl" value={brandFilter} onChange={(e) => setFilter('brand', e.target.value)}
          aria-label="Show audits for">
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="ctl" value={statusFilter} onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Status">
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABEL) as AuditStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <input className="ctl" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search audits" aria-label="Search audits" />
        {filtered && (
          <button className="btn sm" onClick={() => { setQ(''); setParams(new URLSearchParams(), { replace: true }) }}>
            Clear
          </button>
        )}
      </div>

      {adding && (
        <form className="newform" onSubmit={add}>
          <div className="two">
            <div className="fld">
              <label>Brand</label>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} autoFocus={!brandId}>
                <option value="" disabled>Pick a brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Audit title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="two">
            <div className="fld">
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as AuditMode)}>
                <option value="manual">Manual · every field typed</option>
                <option value="logic">Logic · generated, derived and constrained</option>
              </select>
            </div>
            <div className="fld">
              <label>Checklist</label>
              <select
                value={checklist}
                onChange={(e) => {
                  if (e.target.value === '__build') setBuilding(true)
                  else setChecklist(e.target.value)
                }}
              >
                <option value="">No checklist</option>
                <optgroup label="Presets">
                  {PRESETS.map((p) => (
                    <option key={p.id} value={presetRef(p.id)}>{p.name} checklist · {p.keys.length} checks</option>
                  ))}
                </optgroup>
                {templates.length > 0 && (
                  <optgroup label="Your templates">
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} · {t.checks.length} checks</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Or">
                  <option value="__build" disabled={!chosen}>Pick the checks yourself</option>
                </optgroup>
              </select>
            </div>
          </div>
          <button className="btn pri" type="submit" disabled={!chosen || !title.trim()}>Create audit</button>
        </form>
      )}

      {brands.length === 0 ? (
        <div className="empty">
          <b>Add a brand first</b>
          <span>An audit is always for a brand. <Link to="/brands">Go to Brands</Link> and add the client you audit for.</span>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          {filtered
            ? <><b>No audits match</b><span>Nothing fits these filters.</span></>
            : <><b>No audits yet</b><span>An audit is the container the findings hang off. Start one with New audit.</span></>}
        </div>
      ) : (
        <div className="cards">
          {shown.map((a) => {
            const b = byId.get(a.brand_id)
            return (
              <div className="card" key={a.id}>
                <Link to={`/audit/${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3>{a.title}{' '}
                    <span className={'modetag ' + a.mode}>{a.mode === 'logic' ? 'Logic' : 'Manual'}</span>
                    {a.is_sample && <span className="modetag sample">Sample</span>}
                  </h3>
                  <div className="card-brand">{b?.name ?? 'Unknown brand'}</div>
                  <div className="meta">
                    {STATUS_LABEL[a.status] ?? a.status} &nbsp;·&nbsp; {new Date(a.created_at).toLocaleDateString()}
                    {a.checklist_name && <> &nbsp;·&nbsp; {a.checklist_name} checklist</>}
                  </div>
                  {a.is_sample && (
                    <p className="samplenote">
                      Made up, so you have something to look at. Open it, then try Export.
                      Delete it whenever you like.
                    </p>
                  )}
                </Link>
                <div className="row2">
                  <Link className="btn sm" to={`/audit/${a.id}`}>Open</Link>
                  <button className="btn sm danger" onClick={() => remove(a)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {building && chosen && (
        <ChecklistBuilder
          mode="audit"
          templates={templates}
          base={checklist || presetRef(PRESETS[0].id)}
          onClose={() => setBuilding(false)}
          onDone={addCustom}
        />
      )}
    </div>
  )
}
