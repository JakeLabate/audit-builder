import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteBrand, listAudits, listBrands, updateBrand } from '../lib/api'
import type { Audit, Brand } from '../lib/types'
import BrandKit from '../components/BrandKit'
import BrandDesigns from '../components/BrandDesigns'

/**
 * One brand: its name, domain, brand kit and export designs.
 *
 * Its audits are managed on the Audits tab, not here. This page says how many
 * there are and links to them, narrowed to this brand.
 */
export default function BrandView() {
  const { brandId } = useParams()
  const navigate = useNavigate()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [audits, setAudits] = useState<Audit[]>([])
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const all = await listBrands()
        const b = all.find((x) => x.id === brandId) ?? null
        setBrand(b)
        setMissing(!b)
        setAudits(await listAudits(brandId))
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [brandId])

  if (missing) {
    return (
      <div className="wrap">
        <div className="empty">
          <b>No such brand</b>
          <span>It may have been deleted. <Link to="/brands">Back to Brands</Link></span>
        </div>
      </div>
    )
  }
  if (!brand) return <div className="wrap"><span className="saving">Loading</span></div>

  async function save(patch: Partial<Brand>) {
    try {
      await updateBrand(brand!.id, patch)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function removeBrand() {
    if (!brand) return
    const n = audits.length
    const what = n === 0 ? '' : n === 1 ? ', its audit and every finding in it' : `, its ${n} audits and every finding in them`
    if (!confirm(`Delete ${brand.name}${what}?`)) return
    try {
      await deleteBrand(brand.id)
      navigate('/brands', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const n = audits.length

  return (
    <div className="wrap">
      <div className="crumbs" style={{ marginBottom: 14 }}>
        <Link to="/brands">Brands</Link>
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
            onBlur={() => save({ name: brand.name })}
          />
        </div>
        <div className="fld">
          <label>Domain</label>
          <input
            value={brand.domain ?? ''}
            onChange={(e) => setBrand({ ...brand, domain: e.target.value })}
            onBlur={() => save({ domain: brand.domain })}
          />
        </div>
      </div>

      <div className="brand-audits">
        <span>
          <b>{n}</b> {n === 1 ? 'audit' : 'audits'} for this brand
        </span>
        {n > 0 && <Link className="btn sm" to={`/audits?brand=${brand.id}`}>See them on Audits</Link>}
        <Link className="btn sm" to={`/audits?brand=${brand.id}&new=1`}>New audit</Link>
        <span className="grow" />
        <button className="btn sm danger" onClick={removeBrand}>Delete brand</button>
      </div>

      <h2 className="brand-h">Brand kit</h2>
      {/* The kit saves on a delay and the designs save at once, so each hands
          back only what it changed and is merged into the brand as it now is.
          Replacing the whole brand would let one overwrite the other. */}
      <BrandKit brand={brand}
        onChange={(b) => setBrand((prev) => (prev ? { ...prev, identity: b.identity } : b))} />

      <h2 className="brand-h">Export design</h2>
      <BrandDesigns brand={brand}
        onChange={(d) => setBrand((prev) => (prev ? { ...prev, export_design: d } : prev))} />
    </div>
  )
}
