import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createAudit, deleteAudit, deleteBrand, listAudits, listBrands, updateBrand,
} from '../lib/api'
import type { Audit, Brand } from '../lib/types'

export default function BrandView() {
  const { brandId } = useParams()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [audits, setAudits] = useState<Audit[]>([])
  const [title, setTitle] = useState('Technical SEO Audit')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const all = await listBrands()
        setBrand(all.find((b) => b.id === brandId) ?? null)
        setAudits(await listAudits(brandId))
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [brandId])

  if (!brand) return <div className="wrap"><span className="saving">Loading</span></div>

  async function add() {
    if (!brand || !title.trim()) return
    try {
      const a = await createAudit(brand.org_id, brand.id, title.trim())
      setAudits((p) => [a, ...p])
    } catch (e) {
      setErr((e as Error).message)
    }
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

      <div className="bar" style={{ marginTop: 22 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--line-2)', minWidth: 260 }}
        />
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
                <h3>{a.title}</h3>
                <div className="meta">
                  {a.status} &nbsp;·&nbsp; {new Date(a.created_at).toLocaleDateString()}
                </div>
              </Link>
              <div className="row2">
                <Link className="btn sm" to={`/audit/${a.id}`}>Open</Link>
                <button className="btn sm danger" onClick={() => removeAudit(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
