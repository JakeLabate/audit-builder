import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createBrand, currentOrg, listAudits, listBrands } from '../lib/api'
import type { Audit, Brand, Org } from '../lib/types'

export default function Brands() {
  const [org, setOrg] = useState<Org | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [audits, setAudits] = useState<Audit[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setOrg(await currentOrg())
        setBrands(await listBrands())
        setAudits(await listAudits())
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !name.trim()) return
    try {
      const b = await createBrand(org.id, name.trim(), domain.trim())
      setBrands((p) => [...p, b].sort((x, y) => x.name.localeCompare(y.name)))
      setName('')
      setDomain('')
      setAdding(false)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const countFor = (id: string) => audits.filter((a) => a.brand_id === id).length

  return (
    <div className="wrap">
      <h1 className="page">Brands</h1>
      <p className="sub">
        Every audit belongs to a brand. Findings live under an audit, so this is where a new
        engagement starts.
      </p>

      {err && (
        <div className="issue">
          <b>Something went wrong</b>
          {err}
        </div>
      )}

      <div className="bar">
        <button className="btn pri" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'New brand'}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={add}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            padding: 18,
            marginBottom: 22,
            maxWidth: 620,
          }}
        >
          <div className="two">
            <div className="fld">
              <label>Brand name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="fld">
              <label>Domain</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>
          <button className="btn pri" type="submit" disabled={!name.trim()}>
            Create brand
          </button>
        </form>
      )}

      {brands.length === 0 && !adding ? (
        <div className="empty">
          <b>No brands yet</b>
          <span>Add the first client you audit for and the rest follows from there.</span>
        </div>
      ) : (
        <div className="cards">
          {brands.map((b) => (
            <Link className="card" key={b.id} to={`/brand/${b.id}`}>
              <h3>{b.name}</h3>
              <div className="meta">{b.domain ?? 'No domain set'}</div>
              <div className="row2">
                <div>
                  <b>{countFor(b.id)}</b>
                  {countFor(b.id) === 1 ? 'Audit' : 'Audits'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
