import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Brand } from '../lib/types'
import {
  LEVEL_NAME, PDF_DESIGNS, SHEET_DESIGNS,
  type DesignLevel, type DesignMeta, type PdfDesignKey, type SheetDesignKey,
} from '../lib/designs'
import { DEMO_FINDINGS, DEMO_IMAGES, DEMO_REGISTER, demoAudit } from '../lib/designdemo'
import { sheetPreviewVars, sheetTheme } from '../lib/sheettheme'
import { buildPrintDocument, buildStandaloneDocument } from '../export/pdf'
import { PRINT_CSS } from '../export/print.css'

/**
 * Choosing a design.
 *
 * Each document design is shown as the document: a cover and a finding built
 * by the real exporter, with this brand's colours, faces and logo, scaled
 * down. A swatch or a screenshot would show what the design looked like for
 * somebody else's brand. This shows what the client will receive.
 *
 * The register cannot be shown that way, because the real sheet only exists
 * once Google has made it, so its thumbnail is a small grid drawn from the
 * same theme the exporter formats the sheet with.
 */

const PAGE_W = 794
const PAGE_H = 1123
const GAP = 30

/** The two demo pages side by side, on a transparent ground. */
const THUMB_CSS = 'html,body{width:auto;margin:0;background:transparent;overflow:hidden}'
  + `body{display:flex;gap:${GAP}px}`
  + '.page{flex:none;background:#fff;box-shadow:0 0 0 1.5px rgba(25,26,62,.16)}'

/** A design, as the document it makes for this brand. */
export function PdfThumb({ brand, design, logoUrl }: {
  brand: Brand; design: PdfDesignKey; logoUrl?: string | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.16)
  const natural = PAGE_W * 2 + GAP

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => { if (el.clientWidth > 20) setScale(el.clientWidth / natural) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [natural])

  // Rebuilt only when what it draws changes: the kit, the name, the design.
  const kit = JSON.stringify(brand.identity ?? {})
  const doc = useMemo(() => {
    const html = buildPrintDocument(
      brand, demoAudit(brand), DEMO_FINDINGS, 'Your name', logoUrl ?? null, null, DEMO_IMAGES, [], design,
    )
    return buildStandaloneDocument(html, PRINT_CSS, 'Design preview', THUMB_CSS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, brand.name, brand.domain, brand.primary_color, design, logoUrl])

  return (
    <div className="dz-thumb" ref={box} style={{ height: PAGE_H * scale }} aria-hidden="true">
      <iframe title="" srcDoc={doc} scrolling="no" tabIndex={-1} loading="lazy"
        style={{ width: natural, height: PAGE_H, transform: `scale(${scale})` }} />
    </div>
  )
}

/** A register design, as a few rows of the grid it makes for this brand. */
export function SheetThumb({ brand, design }: { brand: Brand; design: SheetDesignKey }) {
  const th = sheetTheme(brand, design)
  return (
    <div className="dz-thumb dz-sheet" aria-hidden="true">
      <table className={`sc-table sc-grid-${th.grid}`} style={sheetPreviewVars(th) as CSSProperties}>
        <thead>
          <tr>{DEMO_REGISTER.headers.map((h) => <th key={h}>{h}</th>)}</tr>
          <tr className="sc-notes">{DEMO_REGISTER.notes.map((n) => <td key={n}>{n}</td>)}</tr>
        </thead>
        <tbody>
          {DEMO_REGISTER.rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i === 2 ? 'sc-band b-' + c.toLowerCase() : ''}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Common {
  /** Whose kit the previews are drawn with. */
  brand: Brand
  logoUrl?: string | null
  /** This person cannot change it here: the cards show and do nothing. */
  locked?: boolean
  /** Why, said once under the cards. */
  lockedNote?: string | null
  busy?: boolean
}

type Props =
  | (Common & {
      kind: 'pdf'
      /** What this level chose. Null when it follows the level above. */
      value: PdfDesignKey | null
      /** What it gets if it chooses nothing, and which level that comes from.
       *  Omit at the top level, where there is nothing above to follow. */
      inherited?: { key: PdfDesignKey; from: DesignLevel }
      onChange: (key: PdfDesignKey | null) => void
    })
  | (Common & {
      kind: 'sheet'
      value: SheetDesignKey | null
      inherited?: { key: SheetDesignKey; from: DesignLevel }
      onChange: (key: SheetDesignKey | null) => void
    })

/**
 * One row of designs to pick from. With `inherited`, the first card is "follow
 * the level above", which is how a brand or an audit goes back to having no
 * choice of its own. Without it, one design is always the choice.
 */
export default function DesignPicker(props: Props) {
  const { kind, brand, logoUrl, value, inherited, locked, lockedNote, busy } = props
  const designs = (kind === 'pdf' ? PDF_DESIGNS : SHEET_DESIGNS) as DesignMeta<string>[]
  const pick = props.onChange as (key: string | null) => void
  const nameOf = (k: string) => designs.find((d) => d.key === k)?.name ?? k
  // At the top level nothing is "chosen" until someone picks, and what is in
  // force then is the first design, so that card reads as the current one.
  const current = value ?? (inherited ? null : designs[0].key)

  const thumb = (key: string) => (kind === 'pdf'
    ? <PdfThumb brand={brand} design={key as PdfDesignKey} logoUrl={logoUrl} />
    : <SheetThumb brand={brand} design={key as SheetDesignKey} />)

  return (
    <div className={`dz dz-${kind}`} role="radiogroup"
      aria-label={kind === 'pdf' ? 'Document design' : 'Register design'}>
      {inherited && (
        <button type="button" role="radio" aria-checked={value === null}
          className={'dz-card dz-follow' + (value === null ? ' on' : '')}
          disabled={locked || busy} onClick={() => pick(null)}>
          {thumb(inherited.key)}
          <span className="dz-name">Follow {LEVEL_NAME[inherited.from]}
            {value === null && <i>In use</i>}</span>
          <span className="dz-what">
            Currently {nameOf(inherited.key)}. If {LEVEL_NAME[inherited.from]} changes its design, this changes with it.
          </span>
        </button>
      )}
      {designs.map((d) => (
        <button key={d.key} type="button" role="radio" aria-checked={current === d.key}
          className={'dz-card' + (current === d.key ? ' on' : '')}
          disabled={locked || busy} onClick={() => pick(d.key)}>
          {thumb(d.key)}
          <span className="dz-name">{d.name}{current === d.key && <i>In use</i>}</span>
          <span className="dz-what">{d.what}</span>
        </button>
      ))}
      {locked && lockedNote && <p className="dz-locked">{lockedNote}</p>}
    </div>
  )
}
