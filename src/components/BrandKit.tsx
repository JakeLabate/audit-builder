import { useEffect, useRef, useState } from 'react'
import type { Brand } from '../lib/types'
import { evidenceUrl, updateBrand, uploadBrandAsset } from '../lib/api'
import {
  BODY_FONTS, DISPLAY_FONTS, contrast, identityOf, isHex, reportPalette,
  type BrandIdentity,
} from '../lib/brand'

/**
 * The brand kit. Everything the report generator needs to stop looking like
 * my template and start looking like the client's document.
 *
 * The cover preview is the point of the screen: it is the same colours, faces
 * and logo the PDF will use, so a bad combination is visible here rather than
 * in a file already sent to a client.
 */
export default function BrandKit({
  brand, onChange,
}: { brand: Brand; onChange: (b: Brand) => void }) {
  const [id, setId] = useState<BrandIdentity>(() => identityOf(brand))
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { setId(identityOf(brand)) }, [brand.id])

  // Resolve the logo for the preview. Signed URLs expire, so this re-runs
  // whenever the stored path changes rather than being cached forever.
  useEffect(() => {
    let live = true
    ;(async () => {
      if (!id.logo_path) { setLogo(null); return }
      const url = await evidenceUrl(id.logo_path)
      if (live) setLogo(url)
    })()
    return () => { live = false }
  }, [id.logo_path])

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await updateBrand(brand.id, { identity: id as unknown as Record<string, unknown> })
        onChange({ ...brand, identity: id as unknown as Record<string, unknown> })
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 700)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const set = <K extends keyof BrandIdentity>(k: K, v: BrandIdentity[K]) =>
    setId((p) => ({ ...p, [k]: v }))
  const setColor = (k: 'primary' | 'accent' | 'ink', v: string) =>
    setId((p) => ({ ...p, colors: { ...p.colors, [k]: v || null } }))
  const setContact = (k: 'name' | 'role' | 'email', v: string) =>
    setId((p) => ({ ...p, contact: { ...p.contact, [k]: v || null } }))

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 4_000_000) { setErr('Logos are capped at 4MB. That one is larger.'); return }
    setBusy('logo')
    try {
      const path = await uploadBrandAsset(brand.org_id, brand.id, 'logo', f)
      set('logo_path', path)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(null)
      if (file.current) file.current.value = ''
    }
  }

  const pal = reportPalette(id)
  const ratio = contrast(pal.primary, pal.onPrimary)

  return (
    <div className="kit">
      <div className="kit-form">

        <div className="kit-grp">
          <h3>How they are named</h3>
          <div className="two">
            <div className="fld">
              <label>Legal name</label>
              <p className="hint">Printed on the cover. Their registered name, if it differs from the one you use day to day.</p>
              <input value={id.legal_name ?? ''} onChange={(e) => set('legal_name', e.target.value || null)}
                placeholder={brand.name} />
            </div>
            <div className="fld">
              <label>Industry</label>
              <p className="hint">Sets the language in generated summaries.</p>
              <input value={id.industry ?? ''} onChange={(e) => set('industry', e.target.value || null)} />
            </div>
          </div>
          <div className="fld">
            <label>Slogan</label>
            <p className="hint">Sits under the client name on the cover. Leave blank if they do not have one, rather than inventing it.</p>
            <input value={id.slogan ?? ''} onChange={(e) => set('slogan', e.target.value || null)} />
          </div>
          <div className="fld">
            <label>Voice</label>
            <p className="hint">How they write about themselves. Guides tone, never quoted directly.</p>
            <textarea rows={2} value={id.voice ?? ''} onChange={(e) => set('voice', e.target.value || null)} />
          </div>
        </div>

        <div className="kit-grp">
          <h3>Logo</h3>
          <div className="kit-logo">
            <div className="kit-logo-box" style={{ background: pal.wash }}>
              {logo
                ? <img src={logo} alt="" />
                : <span className="kit-none">No logo yet</span>}
            </div>
            <div>
              <button className="btn" onClick={() => file.current?.click()} disabled={busy === 'logo'}>
                {busy === 'logo' ? 'Uploading' : logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {logo && (
                <button className="btn ghost sm" onClick={() => set('logo_path', null)}>Remove</button>
              )}
              <p className="hint" style={{ marginTop: 8 }}>
                PNG or SVG with a transparent background reads best on a coloured cover. Up to 4MB.
              </p>
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={pick} hidden />
          </div>
        </div>

        <div className="kit-grp">
          <h3>Colour</h3>
          <div className="three">
            {(['primary', 'accent', 'ink'] as const).map((k) => (
              <div className="fld" key={k}>
                <label>{k === 'ink' ? 'Body text' : k[0].toUpperCase() + k.slice(1)}</label>
                <p className="hint">
                  {k === 'primary' ? 'The cover ground.'
                    : k === 'accent' ? 'Section rules and labels.'
                    : 'Left blank, this is derived from the primary.'}
                </p>
                <div className="kit-color">
                  <input type="color" value={
                    (id.colors[k] && isHex(id.colors[k]!)) ? id.colors[k]! : pal[k === 'ink' ? 'ink' : k]
                  } onChange={(e) => setColor(k, e.target.value)} />
                  <input value={id.colors[k] ?? ''} placeholder={pal[k === 'ink' ? 'ink' : k]}
                    onChange={(e) => setColor(k, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div className={'kit-note' + (ratio < 4.5 ? ' warn' : '')}>
            <b>Cover contrast {ratio.toFixed(1)} to 1</b>
            {ratio >= 4.5
              ? `Text on the cover will be ${pal.onPrimary === '#FFFFFF' ? 'white' : 'near black'}, chosen for legibility rather than assumed.`
              : 'Below 4.5 to 1. The cover will be hard to read, and worse in print than on screen. Darken or lighten the primary.'}
          </div>
        </div>

        <div className="kit-grp">
          <h3>Typography</h3>
          <div className="two">
            <div className="fld">
              <label>Display</label>
              <p className="hint">Headings and the cover title.</p>
              <select value={id.type.display}
                onChange={(e) => setId((p) => ({ ...p, type: { ...p.type, display: e.target.value } }))}>
                {DISPLAY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Body</label>
              <p className="hint">Everything else.</p>
              <select value={id.type.body}
                onChange={(e) => setId((p) => ({ ...p, type: { ...p.type, body: e.target.value } }))}>
                {BODY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <p className="hint">
            The list is fixed because the report has to load the face at print time.
            A font it cannot fetch falls back silently and the document looks wrong.
          </p>
        </div>

        <div className="kit-grp">
          <h3>Who it is for</h3>
          <div className="three">
            <div className="fld">
              <label>Name</label>
              <input value={id.contact.name ?? ''} onChange={(e) => setContact('name', e.target.value)} />
            </div>
            <div className="fld">
              <label>Role</label>
              <input value={id.contact.role ?? ''} onChange={(e) => setContact('role', e.target.value)} />
            </div>
            <div className="fld">
              <label>Email</label>
              <input value={id.contact.email ?? ''} onChange={(e) => setContact('email', e.target.value)} />
            </div>
          </div>
        </div>

        {err && <div className="issue"><b>Could not save</b>{err}</div>}
      </div>

      {/* The cover, as it will print. */}
      <aside className="kit-prev">
        <p className="kit-prev-l">Cover preview</p>
        <div className="kit-cover" style={{ background: pal.primary, color: pal.onPrimary }}>
          {logo
            ? <img src={logo} alt="" className="kc-logo" />
            : <span className="kc-logo kc-none">logo</span>}
          <span className="kc-chip" style={{ borderColor: pal.onPrimary }}>Technical SEO Audit</span>
          <h4 style={{ fontFamily: `'${id.type.display}', Georgia, serif` }}>
            Technical SEO Audit, Q3 2026
          </h4>
          <p className="kc-sub" style={{ fontFamily: `'${id.type.body}', Arial, sans-serif` }}>
            {id.legal_name ?? brand.name}{brand.domain ? `  ·  ${brand.domain}` : ''}
          </p>
          {id.slogan && (
            <p className="kc-slogan" style={{ fontFamily: `'${id.type.display}', Georgia, serif` }}>
              {id.slogan}
            </p>
          )}
          <div className="kc-stats" style={{ borderColor: pal.onPrimary + '55' }}>
            <div><b>10</b><span>Findings</span></div>
            <div><b>1</b><span>P1</span></div>
            <div><b>38,412</b><span>URLs</span></div>
          </div>
          {id.contact.name && (
            <p className="kc-contact">Prepared for {id.contact.name}{id.contact.role ? `, ${id.contact.role}` : ''}</p>
          )}
        </div>
        <div className="kit-swatches">
          {(['primary', 'accent', 'ink', 'wash'] as const).map((k) => (
            <div key={k}>
              <i style={{ background: pal[k] }} />
              <span>{k}</span>
              <code>{pal[k]}</code>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
