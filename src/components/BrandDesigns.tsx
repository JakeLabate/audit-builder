import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { evidenceUrl, getOrg, updateBrand } from '../lib/api'
import { identityOf } from '../lib/brand'
import type { Brand, Org } from '../lib/types'
import {
  designOf, resolveDesign, withDesign, type ExportDesign, type PdfDesignKey, type SheetDesignKey,
} from '../lib/designs'
import DesignPicker from './DesignPicker'

/**
 * This brand's export designs.
 *
 * The middle of three levels. A brand starts out following the workspace, and
 * stores nothing until it picks a design of its own. What it picks applies to
 * every audit for the brand, unless an audit picks its own in its export
 * dialog. The previews are drawn with this brand's kit, so editing the kit
 * above changes them.
 */
export default function BrandDesigns({ brand, onChange }: {
  brand: Brand
  /** Only the design changed. The caller merges it, so a kit edit saving at
   *  the same moment is not overwritten by a stale copy of the brand. */
  onChange: (design: ExportDesign) => void
}) {
  const [org, setOrg] = useState<Org | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getOrg(brand.org_id).then((o) => { if (live) setOrg(o) }).catch(() => {})
    return () => { live = false }
  }, [brand.org_id])

  const logoPath = identityOf(brand).logo_path
  useEffect(() => {
    let live = true
    setLogo(null)
    if (logoPath) evidenceUrl(logoPath).then((u) => { if (live) setLogo(u) }).catch(() => {})
    return () => { live = false }
  }, [logoPath])

  const own = designOf(brand.export_design)
  const above = resolveDesign({ workspace: org })

  async function choose(kind: 'pdf' | 'sheet', key: PdfDesignKey | SheetDesignKey | null) {
    const next = withDesign(brand.export_design, kind, key as never)
    const before = own
    onChange(next)
    setBusy(true)
    try { await updateBrand(brand.id, { export_design: next }); setErr(null) }
    catch (e) { onChange(before); setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="bdz">
      <p className="sub bdz-sub">
        How this brand's exports look. Every design carries the same audit and is drawn from the
        kit above. Follow the workspace and this brand changes whenever the workspace
        design does, which is set on <Link to="/designs">Designs</Link>. One audit can still
        differ, from its export dialog.
      </p>
      {err && <div className="issue"><b>Could not save</b>{err}</div>}

      <h3 className="bdz-h">The document</h3>
      <DesignPicker kind="pdf" brand={brand} logoUrl={logo} busy={busy}
        value={own.pdf ?? null} inherited={above.pdf}
        onChange={(k) => choose('pdf', k)} />

      <h3 className="bdz-h">The register</h3>
      <DesignPicker kind="sheet" brand={brand} busy={busy}
        value={own.sheet ?? null} inherited={above.sheet}
        onChange={(k) => choose('sheet', k)} />
    </div>
  )
}
