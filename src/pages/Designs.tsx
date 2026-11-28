import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentOrg, evidenceUrl, listAudits, listBrands, updateOrg } from '../lib/api'
import { listMembers } from '../lib/team'
import { identityOf } from '../lib/brand'
import type { Audit, Brand, Org } from '../lib/types'
import {
  designOf, pdfDesign, resolveDesign, sheetDesign, withDesign,
  type PdfDesignKey, type SheetDesignKey,
} from '../lib/designs'
import { DEMO_BRAND } from '../lib/designdemo'
import DesignPicker from '../components/DesignPicker'

/**
 * The workspace's export designs.
 *
 * This is the top of three levels. What is picked here is what every brand
 * and every audit exports with, unless a brand or an audit has picked its
 * own. The page also lists the ones that have, because a default nobody can
 * see the exceptions to is a default nobody trusts.
 */
export default function Designs() {
  const [org, setOrg] = useState<Org | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [audits, setAudits] = useState<Audit[]>([])
  const [withId, setWithId] = useState<string>('')
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const o = await currentOrg()
        setOrg(o)
        const [b, a] = await Promise.all([listBrands(), listAudits()])
        // Another workspace's brands are not this workspace's to preview with.
        const mine = o ? b.filter((x) => x.org_id === o.id) : b
        setBrands(mine)
        setAudits(o ? a.filter((x) => x.org_id === o.id) : a)
        // A real brand shows more than the sample does, so it goes first.
        setWithId((mine.find((x) => !x.is_sample) ?? mine[0])?.id ?? '')
        if (o) {
          const m = await listMembers(o.id).catch(() => [])
          setRole(m.find((x) => x.is_you)?.role ?? null)
        }
      } catch (e) { setErr((e as Error).message) }
    })()
  }, [])

  const brand = brands.find((b) => b.id === withId) ?? DEMO_BRAND

  // The logo sits in a private bucket, so the previews need a signed address.
  const logoPath = identityOf(brand).logo_path
  useEffect(() => {
    let live = true
    setLogo(null)
    if (logoPath) evidenceUrl(logoPath).then((u) => { if (live) setLogo(u) }).catch(() => {})
    return () => { live = false }
  }, [logoPath])

  const now = resolveDesign({ workspace: org })
  // Until the role is known nobody is told they cannot. An owner is the only
  // one the database lets change a workspace, so the page says so up front
  // rather than letting an editor pick a card and watch it fail.
  const locked = !!org && role !== null && role !== 'owner'
  const lockedNote = 'Only an owner can change the workspace design. You can still set one for a brand, on its page, or for a single audit, in its export dialog.'

  async function choose(kind: 'pdf' | 'sheet', key: PdfDesignKey | SheetDesignKey | null) {
    if (!org || !key) return
    const next = withDesign(org.export_design, kind, key as never)
    const before = org
    setOrg({ ...org, export_design: next })
    setBusy(true)
    try { await updateOrg(org.id, { export_design: next }); setErr(null) }
    catch (e) { setOrg(before); setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  // Where the workspace design is not what gets used.
  const own = useMemo(() => {
    const names = (d: { pdf?: string; sheet?: string }) => [
      d.pdf ? `document in ${pdfDesign(d.pdf).name}` : '',
      d.sheet ? `register in ${sheetDesign(d.sheet).name}` : '',
    ].filter(Boolean).join(', ')
    const brandName = new Map(brands.map((b) => [b.id, b.name]))
    return {
      brands: brands.map((b) => ({ b, d: designOf(b.export_design) }))
        .filter((x) => x.d.pdf || x.d.sheet).map((x) => ({ id: x.b.id, name: x.b.name, what: names(x.d) })),
      audits: audits.map((a) => ({ a, d: designOf(a.export_design) }))
        .filter((x) => x.d.pdf || x.d.sheet)
        .map((x) => ({ id: x.a.id, name: `${brandName.get(x.a.brand_id) ?? 'Brand'}, ${x.a.title}`, what: names(x.d) })),
    }
  }, [brands, audits])

  return (
    <div className="page-wrap doc dzp">
      <header className="doc-hd">
        <h1>Designs</h1>
        <p>
          How an export looks. Every design carries the same audit, and each one is drawn from
          the brand's own kit, so the colours, faces and logo are the client's whichever you pick.
          What you choose here applies to every brand and audit in {org?.name ?? 'this workspace'} that
          has not chosen its own.
        </p>
      </header>

      {err && <div className="issue"><b>Problem</b>{err}</div>}

      <div className="dzp-with">
        <label htmlFor="dz-with">Preview with</label>
        <select id="dz-with" value={withId} onChange={(e) => setWithId(e.target.value)}>
          {brands.length === 0 && <option value="">A brand with no kit</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span>The previews are the real exporter running on this brand's kit. Picking a brand here changes nothing.</span>
      </div>

      <section className="doc-s">
        <h2>The document</h2>
        <p className="doc-p">
          The PDF. One finding to a page in every design, with the same sections and the same
          fields. A part with nothing in it is left out, whichever design it is.
          Currently <b>{pdfDesign(now.pdf.key).name}</b>.
        </p>
        <DesignPicker kind="pdf" brand={brand} logoUrl={logo} busy={busy} locked={locked} lockedNote={lockedNote}
          value={designOf(org?.export_design).pdf ?? null}
          onChange={(k) => choose('pdf', k)} />
      </section>

      <section className="doc-s">
        <h2>The register</h2>
        <p className="doc-p">
          The Google Sheet. The same tabs, columns and notes in every design.
          Currently <b>{sheetDesign(now.sheet.key).name}</b>.
        </p>
        <DesignPicker kind="sheet" brand={brand} busy={busy} locked={locked}
          value={designOf(org?.export_design).sheet ?? null}
          onChange={(k) => choose('sheet', k)} />
      </section>

      <section className="doc-s">
        <h2>Where something else is used</h2>
        <p className="doc-p">
          A brand can have its own design, set on its page under the brand kit. An audit can have
          its own too, set in its export dialog. The most specific choice wins: the audit, then
          the brand, then this page.
        </p>
        {own.brands.length === 0 && own.audits.length === 0 ? (
          <p className="doc-none">Nothing has its own design. Everything follows this page.</p>
        ) : (
          <ul className="dzp-own">
            {own.brands.map((x) => (
              <li key={x.id}>
                <span className="dzp-lv">Brand</span>
                <Link to={`/brands/${x.id}`}>{x.name}</Link>
                <span>{x.what}</span>
              </li>
            ))}
            {own.audits.map((x) => (
              <li key={x.id}>
                <span className="dzp-lv">Audit</span>
                <Link to={`/audit/${x.id}`}>{x.name}</Link>
                <span>{x.what}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
