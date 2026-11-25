import { useEffect, useState } from 'react'
import { DEFAULT_KIND } from '../lib/kind'
import { Link, useParams } from 'react-router-dom'
import {
  createAudit, deleteAudit, deleteBrand, listAudits, listBrands, updateBrand,
} from '../lib/api'
import type { Audit, AuditMode, Brand } from '../lib/types'
import BrandKit from '../components/BrandKit'
import ChecklistBuilder, { type BuilderResult } from '../components/ChecklistBuilder'
import { PRESETS, nameFor, presetRef, specsFor, type AuditTemplate } from '../lib/checks'
import { createAuditWithChecks, createTemplate, listTemplates } from '../lib/checkdata'

export default function BrandView() {
  const { brandId } = useParams()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [audits, setAudits] = useState<Audit[]>([])
  const [title, setTitle] = useState(DEFAULT_KIND)
  const [mode, setMode] = useState<AuditMode>('manual')
  // What the new audit sets out to look at. Empty means no checklist, which
  // is an audit exactly as it has always been.
  const [checklist, setChecklist] = useState('')
  const [templates, setTemplates] = useState<AuditTemplate[]>([])
  const [building, setBuilding] = useState(false)
  const [tab, setTab] = useState<'audits' | 'kit'>('audits')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const all = await listBrands()
        setBrand(all.find((b) => b.id === brandId) ?? null)
        setAudits(await listAudits(brandId))
        // Templates are optional. Not having any, or not being able to read
        // them, never stops the page.
        setTemplates(await listTemplates().catch(() => []))
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [brandId])

  if (!brand) return <div className="wrap"><span className="saving">Loading</span></div>

  async function add() {
    if (!brand || !title.trim()) return
    try {
      const specs = specsFor(checklist || null, templates)
      const a = specs.length
        ? await createAuditWithChecks(brand.org_id, brand.id, title.trim(), mode, nameFor(checklist, templates), specs)
        : await createAudit(brand.org_id, brand.id, title.trim(), mode)
      setAudits((p) => [a, ...p])
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  /** The audit, from a checklist picked check by check. Errors go back to the
   *  dialog, which is still open and is where the person is looking. */
  async function addCustom(r: BuilderResult) {
    if (!brand) return
    const name = title.trim() || DEFAULT_KIND
    let saved: AuditTemplate | null = null
    if (r.saveAs) {
      saved = await createTemplate(brand.org_id, r.saveAs, r.specs)
      setTemplates((p) => [...p, saved!].sort((a, b) => a.name.localeCompare(b.name)))
    }
    const a = await createAuditWithChecks(
      brand.org_id, brand.id, name, mode, saved?.name ?? r.baseName ?? 'Custom', r.specs)
    setAudits((p) => [a, ...p])
    if (saved) setChecklist(saved.id)
    setBuilding(false)
    setErr(null)
  }

  async function removeAudit(id: string) {
    if (!confirm('Delete this audit and every finding in it?')) return
    await deleteAudit(id)
    setAudits((p) => p.filter((a) => a.id !== id))
  }

  async function removeBrand() {
    if (!brand) return
    if (!confirm(`Delete ${brand.name}, its audits and all their findings?`)) return
    await deleteBrand(brand.id)
    location.href = '/'
  }

  return (
    <div className="wrap">
      <div className="crumbs" style={{ marginBottom: 14 }}>
        <Link to="/">Brands</Link>
        <span>/</span>
        <b>{brand.name}</b>
      </div>
      <h1 className="page">{brand.name}</h1>
      <p className="sub">{brand.domain ?? 'No domain set'}</p>

      {err && <div className="issue"><b>Something went wrong</b>{err}</div>}

      <div className="two" style={{ maxWidth: 620, marginBottom: 8 }}>
        <div className="fld">
          <label>Brand name</label>
          <input
            value={brand.name}
            onChange={(e) => setBrand({ ...brand, name: e.target.value })}
            onBlur={() => updateBrand(brand.id, { name: brand.name })}
          />
        </div>
        <div className="fld">
          <label>Domain</label>
          <input
            value={brand.domain ?? ''}
            onChange={(e) => setBrand({ ...brand, domain: e.target.value })}
            onBlur={() => updateBrand(brand.id, { domain: brand.domain })}
          />
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 20 }}>
        <button className={'tab' + (tab === 'audits' ? ' on' : '')} onClick={() => setTab('audits')}>
          Audits
        </button>
        <button className={'tab' + (tab === 'kit' ? ' on' : '')} onClick={() => setTab('kit')}>
          Brand kit
        </button>
      </div>

      {tab === 'kit' && <BrandKit brand={brand} onChange={setBrand} />}

      {tab === 'audits' && (<>
      <div className="bar" style={{ marginTop: 22 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--line-2)', minWidth: 260 }}
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AuditMode)}
          style={{ padding: '7px 10px', border: '1px solid var(--line-2)' }}
          aria-label="Audit mode"
        >
          <option value="manual">Manual · every field typed</option>
          <option value="logic">Logic · generated, derived and constrained</option>
        </select>
        <select
          value={checklist}
          onChange={(e) => {
            if (e.target.value === '__build') setBuilding(true)
            else setChecklist(e.target.value)
          }}
          style={{ padding: '7px 10px', border: '1px solid var(--line-2)' }}
          aria-label="Checklist"
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
            <option value="__build">Pick the checks yourself</option>
          </optgroup>
        </select>
        <button className="btn pri" onClick={add}>New audit</button>
        <span className="grow" />
        <button className="btn danger" onClick={removeBrand}>Delete brand</button>
      </div>

      {audits.length === 0 ? (
        <div className="empty">
          <b>No audits yet</b>
          <span>An audit is the container the findings hang off.</span>
        </div>
      ) : (
        <div className="cards">
          {audits.map((a) => (
            <div className="card" key={a.id}>
              <Link to={`/audit/${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>{a.title}{' '}
                  <span className={'modetag ' + a.mode}>{a.mode === 'logic' ? 'Logic' : 'Manual'}</span>
                  {a.is_sample && <span className="modetag sample">Sample</span>}
                </h3>
                <div className="meta">
                  {a.status} &nbsp;·&nbsp; {new Date(a.created_at).toLocaleDateString()}
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
                <button className="btn sm danger" onClick={() => removeAudit(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}

      {building && (
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
