/**
 * Export designs.
 *
 * A design changes how an export looks and nothing else. Every design prints
 * the same audit: the same sections, the same fields, the same rule that a
 * part with nothing in it is left out, and the same one finding to a page.
 * Every design is also drawn from the brand kit, so whichever one is picked,
 * the document is still the client's colours, faces and logo.
 *
 * The choice is made at three levels, most specific first:
 *
 *   audit      this one audit, set in the export dialog
 *   brand      every audit for this brand, set on the brand page
 *   workspace  everything else, set on the Designs page
 *
 * Each level stores only what it chose. A level that chose nothing stores
 * nothing and follows the level above it, so changing the workspace design
 * reaches every brand and audit that never picked its own.
 *
 * Nothing in this file touches the database or the DOM: the document builder
 * imports it and is bundled for node by scripts/build-sample.mjs.
 */

export type PdfDesignKey = 'classic' | 'editorial' | 'bold' | 'minimal' | 'dossier'
export type SheetDesignKey = 'classic' | 'ledger' | 'grid'

export interface DesignMeta<K extends string> {
  key: K
  name: string
  /** One line: what it looks like and when to reach for it. */
  what: string
}

export const PDF_DESIGNS: DesignMeta<PdfDesignKey>[] = [
  {
    key: 'classic', name: 'Classic',
    what: 'Solid brand cover, a facts strip under each title and small mono labels. The original.',
  },
  {
    key: 'editorial', name: 'Editorial',
    what: 'White cover under a brand band, large display type and hairline rules. Reads like a printed report.',
  },
  {
    key: 'bold', name: 'Bold',
    what: 'Every page opens on a full width band of the brand colour, with the facts as tiles. The most branded.',
  },
  {
    key: 'minimal', name: 'Minimal',
    what: 'Black on white with no fills, and the brand as one rule and the logo. Light on ink, easy to print.',
  },
  {
    key: 'dossier', name: 'Dossier',
    what: 'The facts run down a rail on the left and the argument sits beside them. Reads like a case file.',
  },
]

export const SHEET_DESIGNS: DesignMeta<SheetDesignKey>[] = [
  {
    key: 'classic', name: 'Classic',
    what: 'Header row in the brand colour, a wash under it for the notes, hairlines between findings. The original.',
  },
  {
    key: 'ledger', name: 'Ledger',
    what: 'White header over a heavy brand rule, alternating row tint and no gridlines. Quiet, built for long registers.',
  },
  {
    key: 'grid', name: 'Grid',
    what: 'Accent colour header, every cell boxed and the priority as a solid chip. Loud, built for a shared screen.',
  },
]

/** What a level stores. A key that is absent means "follow the level above". */
export interface ExportDesign { pdf?: PdfDesignKey; sheet?: SheetDesignKey }

/** Where everything lands when no level has chosen: the designs the app has
 *  always exported, so nothing changes for a workspace that never picks. */
export const BUILT_IN: Required<ExportDesign> = { pdf: 'classic', sheet: 'classic' }

const PDF_KEYS = new Set<string>(PDF_DESIGNS.map((d) => d.key))
const SHEET_KEYS = new Set<string>(SHEET_DESIGNS.map((d) => d.key))

/**
 * What a row stored, repaired. Anything unrecognised is dropped rather than
 * trusted, so a design retired later, or a value typed over the API, falls
 * through to the level above instead of printing a document with no styles.
 */
export function designOf(raw: unknown): ExportDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ExportDesign = {}
  if (typeof r.pdf === 'string' && PDF_KEYS.has(r.pdf)) out.pdf = r.pdf as PdfDesignKey
  if (typeof r.sheet === 'string' && SHEET_KEYS.has(r.sheet)) out.sheet = r.sheet as SheetDesignKey
  return out
}

/** Set or clear one half of a level's choice. Null clears it, which is how a
 *  brand or an audit goes back to following the level above. */
export function withDesign<K extends keyof ExportDesign>(
  raw: unknown, kind: K, key: ExportDesign[K] | null,
): ExportDesign {
  const next = { ...designOf(raw) }
  if (key) next[kind] = key
  else delete next[kind]
  return next
}

export type DesignLevel = 'audit' | 'brand' | 'workspace' | 'built-in'

export interface Resolved<K extends string> { key: K; from: DesignLevel }

type Holder = { export_design?: unknown } | null | undefined

/**
 * The design an export will actually use, and which level decided it. Pass
 * whichever levels exist: a brand page has no audit, the Designs page has
 * neither.
 */
export function resolveDesign(levels: { audit?: Holder; brand?: Holder; workspace?: Holder }): {
  pdf: Resolved<PdfDesignKey>; sheet: Resolved<SheetDesignKey>
} {
  const chain: [DesignLevel, ExportDesign][] = [
    ['audit', designOf(levels.audit?.export_design)],
    ['brand', designOf(levels.brand?.export_design)],
    ['workspace', designOf(levels.workspace?.export_design)],
  ]
  const pick = <K extends keyof ExportDesign>(kind: K): Resolved<NonNullable<ExportDesign[K]>> => {
    for (const [from, d] of chain) {
      const key = d[kind]
      if (key) return { key: key as NonNullable<ExportDesign[K]>, from }
    }
    return { key: BUILT_IN[kind] as NonNullable<ExportDesign[K]>, from: 'built-in' }
  }
  return { pdf: pick('pdf'), sheet: pick('sheet') }
}

export const pdfDesign = (key: string | null | undefined): DesignMeta<PdfDesignKey> =>
  PDF_DESIGNS.find((d) => d.key === key) ?? PDF_DESIGNS[0]
export const sheetDesign = (key: string | null | undefined): DesignMeta<SheetDesignKey> =>
  SHEET_DESIGNS.find((d) => d.key === key) ?? SHEET_DESIGNS[0]

/** How a level that decided is named to the person reading the picker. */
export const LEVEL_NAME: Record<DesignLevel, string> = {
  audit: 'this audit',
  brand: 'the brand',
  workspace: 'the workspace',
  'built-in': 'the workspace',
}
