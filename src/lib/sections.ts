import type { Audit } from './types'

/**
 * The report's table of parts. Which sections a deliverable contains, and in
 * what order, is a decision about the document rather than about the audit,
 * so it lives on the audit and is made once rather than at every export.
 */

export type SectionKey =
  | 'cover' | 'summary' | 'contents' | 'method' | 'findings' | 'roadmap' | 'appendix'

export interface SectionChoice { key: SectionKey; on: boolean }

export const CATALOGUE: {
  key: SectionKey
  name: string
  what: string
  /** Pages it adds. 'per-finding' grows with the register. */
  pages: number | 'per-finding'
  /** Some sections cannot be moved or dropped without the document stopping
   *  making sense. Saying so is better than silently ignoring the choice. */
  fixed?: 'first'
  needs?: (a: Audit) => string | null
}[] = [
  {
    key: 'cover', name: 'Cover', pages: 1, fixed: 'first',
    what: 'Client name, audit title, the headline counts, and your byline. Carries the brand kit.',
  },
  {
    key: 'summary', name: 'What we found', pages: 1,
    what: 'The shape of the audit before any detail: findings by band, by pillar, total effort, and the five highest scoring.',
  },
  {
    key: 'contents', name: 'Contents', pages: 1,
    what: 'Every finding listed with its band and page number.',
  },
  {
    key: 'method', name: 'Method and scope', pages: 1,
    what: 'What was covered, the tools and windows the audit declared, what it could not see, and how the priority score is built.',
    needs: (a) => (a.scope_note || (a.sources ?? []).length ? null
      : 'This audit has no scope note and no declared sources, so the section would print almost empty.'),
  },
  {
    key: 'findings', name: 'Findings', pages: 'per-finding',
    what: 'One page per finding: the claim, the evidence, the exhibits, the fix and the decision rail.',
  },
  {
    key: 'roadmap', name: 'Roadmap', pages: 1,
    what: 'The work grouped into waves, with effort totalled per wave and a running total.',
  },
  {
    key: 'appendix', name: 'How to read this', pages: 1,
    what: 'What each part of a finding page means, and what the bands and the score are saying. Worth including for a client who has not had one of these before.',
  },
]

export const DEFAULT_SECTIONS: SectionChoice[] = [
  { key: 'cover', on: true },
  { key: 'summary', on: true },
  { key: 'contents', on: true },
  { key: 'method', on: true },
  { key: 'findings', on: true },
  { key: 'roadmap', on: true },
  { key: 'appendix', on: false },
]

/**
 * What the audit stored, repaired. A section added to the catalogue after a
 * row was written is appended off by default, and anything unrecognised is
 * dropped, so an old audit still renders and a new section never surprises a
 * client by appearing in a document that was already agreed.
 */
export function sectionsOf(audit: Audit | null): SectionChoice[] {
  const raw = Array.isArray(audit?.sections) ? (audit!.sections as SectionChoice[]) : null
  if (!raw) return [...DEFAULT_SECTIONS]
  const known = new Set(CATALOGUE.map((c) => c.key))
  const kept = raw.filter((s) => s && known.has(s.key))
  const seen = new Set(kept.map((s) => s.key))
  const missing = CATALOGUE.filter((c) => !seen.has(c.key)).map((c) => ({ key: c.key, on: false }))
  const all = [...kept, ...missing]

  // The cover is the first page or it is not a cover.
  const cover = all.find((s) => s.key === 'cover')
  const rest = all.filter((s) => s.key !== 'cover')
  return cover ? [cover, ...rest] : rest
}

export function pageCount(chosen: SectionChoice[], findings: number): number {
  return chosen.reduce((n, s) => {
    if (!s.on) return n
    const c = CATALOGUE.find((x) => x.key === s.key)
    if (!c) return n
    return n + (c.pages === 'per-finding' ? findings : c.pages)
  }, 0)
}
