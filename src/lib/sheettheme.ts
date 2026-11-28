import type { Brand, PriorityBand } from './types'
import { contrast, designPalette, identityOf, reportPalette, shade } from './brand'
import { sheetDesign, type SheetDesignKey } from './designs'

/**
 * How the register looks, as plain values.
 *
 * The spreadsheet is built by asking Google to format cells, so a sheet design
 * cannot be a stylesheet the way a document design is. It is this object
 * instead: every colour and every yes or no the exporter needs, worked out
 * once from the brand kit. The exporter reads it to format the real sheet and
 * the export dialog reads it to draw the preview, so the two cannot disagree.
 *
 * A theme changes formatting only. The tabs, the columns, the notes under the
 * headers and every value are the same in all of them.
 */
export interface SheetTheme {
  key: SheetDesignKey
  /** Faces, by Google Fonts name. Null leaves the sheet's own default. */
  font: string | null
  headFont: string | null
  /** Text and rules. */
  ink: string
  ink2: string
  muted: string
  line: string
  wash: string
  /** The header row. `rule` is a heavy line under it, where the design has one. */
  header: { bg: string; fg: string; rule: string | null }
  /** The row of notes under the header. */
  note: { bg: string; fg: string }
  /** Tint on every other finding, where the design stripes its rows. */
  zebra: string | null
  /** Lines between cells: between findings only, round every cell, or none. */
  grid: 'rows' | 'all' | 'none'
  /** Whether the Findings and Roadmap tabs keep the sheet's own gridlines. */
  gridlines: boolean
  /** The block at the top of the Summary tab. Null sets the title in ink on
   *  white over a brand rule instead of filling the block. */
  cover: { bg: string; fg: string; sub: string } | null
  coverRule: string | null
  /** Section headings on the Summary and Method tabs. */
  accent: string
  /** The colour of the sheet's tabs. Null leaves them plain. */
  tab: string | null
  /** The priority cell, per band. A null background is coloured text only. */
  bands: Record<PriorityBand, { bg: string | null; fg: string }>
  /** A wave's heading row on the Roadmap. `full` fills the whole row. */
  wave: { bg: string; fg: string; full: boolean }
}

/** One colour moved toward another. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function sheetTheme(brand: Brand | null, design: SheetDesignKey | string | null | undefined): SheetTheme {
  const key = sheetDesign(design).key
  const id = identityOf(brand)
  const pal = reportPalette(id)
  const dp = designPalette(id)
  const primary = pal.primary
  const onPrimary = pal.onPrimary

  if (key === 'ledger') {
    return {
      key, font: id.type.body, headFont: id.type.display,
      ink: dp.ink, ink2: dp.ink2, muted: dp.muted, line: dp.line, wash: dp.wash,
      header: { bg: '#FFFFFF', fg: dp.ink, rule: dp.rule },
      note: { bg: '#FFFFFF', fg: dp.muted },
      zebra: dp.wash,
      grid: 'none', gridlines: false,
      cover: null, coverRule: dp.fill,
      accent: dp.accentText,
      tab: dp.fill,
      bands: {
        P1: { bg: null, fg: '#8A1C2B' }, P2: { bg: null, fg: '#7E550A' },
        P3: { bg: null, fg: dp.ink2 }, P4: { bg: null, fg: dp.muted },
      },
      wave: { bg: '#FFFFFF', fg: dp.ink, full: false },
    }
  }

  if (key === 'grid') {
    const head = dp.accentFill
    return {
      key, font: id.type.body, headFont: id.type.display,
      ink: dp.ink, ink2: dp.ink2, muted: dp.muted, line: shade(dp.ink, 0.7), wash: dp.wash,
      header: { bg: head, fg: dp.onAccentFill, rule: null },
      note: { bg: dp.wash, fg: dp.ink2 },
      zebra: null,
      grid: 'all', gridlines: false,
      cover: { bg: dp.fill, fg: dp.onFill, sub: mix(dp.onFill, dp.fill, 0.24) },
      coverRule: null,
      accent: dp.accentText,
      tab: head,
      bands: {
        P1: { bg: '#8A1C2B', fg: '#FFFFFF' }, P2: { bg: '#A9720C', fg: '#FFFFFF' },
        P3: { bg: dp.ink2, fg: '#FFFFFF' }, P4: { bg: dp.line, fg: dp.ink },
      },
      wave: { bg: dp.fill, fg: dp.onFill, full: true },
    }
  }

  // Classic. The neutrals are the app's own, as they always were; the header,
  // the cover block and the headings take the brand. With no kit set these
  // are the colours the register has always had.
  const accent = pal.accent
  return {
    key: 'classic', font: null, headFont: null,
    ink: '#191A3E', ink2: '#3B3D69', muted: '#71739A', line: '#E2E2ED', wash: '#F4F4F9',
    header: { bg: primary, fg: onPrimary, rule: null },
    note: { bg: '#F4F4F9', fg: '#71739A' },
    zebra: null,
    grid: 'rows', gridlines: true,
    // The quiet line under the title. With no kit it is the grey it always was.
    cover: { bg: primary, fg: onPrimary, sub: primary === '#191A3E' ? '#B9BAD4' : mix(onPrimary, primary, 0.28) },
    coverRule: null,
    // A pale accent cannot carry a heading on white, so it is darkened first.
    accent: contrast(accent, '#FFFFFF') >= 3 ? accent : dp.accentText,
    tab: null,
    bands: {
      P1: { bg: '#F6E4E7', fg: '#8A1C2B' }, P2: { bg: '#FAF0DC', fg: '#7E550A' },
      P3: { bg: '#ECEAF7', fg: '#4B3E96' }, P4: { bg: '#F1F1F5', fg: '#5A5C80' },
    },
    wave: { bg: '#F4F4F9', fg: '#191A3E', full: false },
  }
}

/**
 * The theme as CSS variables, for the preview in the export dialog and the
 * thumbnails in the design picker. The preview imitates the grid, because the
 * real sheet only exists once Google has made it, but it imitates this theme.
 */
export function sheetPreviewVars(t: SheetTheme): Record<string, string> {
  return {
    '--sc-ink': t.ink, '--sc-ink2': t.ink2, '--sc-muted': t.muted, '--sc-line': t.line,
    '--sc-head-bg': t.header.bg, '--sc-head-fg': t.header.fg,
    '--sc-head-rule': t.header.rule ?? 'transparent',
    '--sc-note-bg': t.note.bg, '--sc-note-fg': t.note.fg,
    '--sc-zebra': t.zebra ?? 'transparent',
    '--sc-p1-bg': t.bands.P1.bg ?? 'transparent', '--sc-p1-fg': t.bands.P1.fg,
    '--sc-p2-bg': t.bands.P2.bg ?? 'transparent', '--sc-p2-fg': t.bands.P2.fg,
    '--sc-p3-bg': t.bands.P3.bg ?? 'transparent', '--sc-p3-fg': t.bands.P3.fg,
    '--sc-p4-bg': t.bands.P4.bg ?? 'transparent', '--sc-p4-fg': t.bands.P4.fg,
    '--sc-font': t.font ? `'${t.font}'` : 'inherit',
    '--sc-head-font': t.headFont ? `'${t.headFont}'` : 'inherit',
  }
}
