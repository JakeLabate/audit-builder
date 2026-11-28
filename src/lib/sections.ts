import type { Audit } from './types'
import { auditScopeOf, kpisOf } from './overview'

/**
 * The report's table of parts. Which sections a deliverable contains, and in
 * what order, is a decision about the document rather than about the audit,
 * so it lives on the audit and is made once rather than at every export.
 */

export type SectionKey =
  | 'cover' | 'brief' | 'summary' | 'contents' | 'method' | 'coverage' | 'findings' | 'roadmap' | 'appendix'

/** What a section may need to know beyond the audit row to say whether it
 *  has anything to print. */
export interface SectionContext { checks: number }

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
  needs?: (a: Audit, ctx: SectionContext) => string | null
}[] = [
  {
    key: 'cover', name: 'Cover', pages: 1, fixed: 'first',
    what: 'Client name, audit title, the headline counts, and your byline. Carries the brand kit.',
  },
  {
    key: 'brief', name: 'The brief', pages: 1,
    what: 'The question the audit answers, the objective, and the numbers it is judged on with where each stood at the start. From the Overview.',
    needs: (a) => (a.question?.trim() || a.objective?.trim() || kpisOf(a).some((k) => k.name.trim()) ? null
      : "This audit has no brief yet, so the section is left out. Fill in Brief on the audit's Overview."),
  },
  {
    key: 'summary', name: 'What we found', pages: 1,
    what: 'The shape of the audit before any detail: the written summary and themes from the Overview, then findings by category, and by band, effort, owner and metric at risk wherever those are filled in.',
  },
  {
    key: 'contents', name: 'Contents', pages: 1,
    what: 'Every finding listed with its reference and page number, and its band when it is scored.',
  },
  {
    key: 'method', name: 'Method and scope', pages: 1,
    what: 'What was covered and left out, the sources the audit declared, and what it could not see. From the Overview. Explains the priority score when findings are scored.',
    needs: (a) => (a.scope_note || (a.sources ?? []).length || Object.values(auditScopeOf(a)).some((v) => v.length) ? null
      : 'This audit has no scope and no declared sources, so the section would print almost empty. Fill in Scope on the Overview.'),
  },
  {
    key: 'coverage', name: 'What was checked', pages: 1,
    what: "Every check on the audit's checklist and how it came out: passed, raised a finding, not applicable or not run. Shows the client what was looked at and came back clean.",
    needs: (_a, ctx) => (ctx.checks ? null
      : "This audit has no checklist, so the section is left out. Add one from the audit's Checklist tab."),
  },
  {
    key: 'findings', name: 'Findings', pages: 'per-finding',
    what: 'Each finding starts on its own page: the claim, why it matters, the evidence with its exhibits, the fix and how it will be verified. A long one runs onto a second page rather than losing anything.',
  },
  {
    key: 'roadmap', name: 'Roadmap', pages: 1,
    what: 'The fixes in order, with owners and effort where they are set, grouped into waves once findings are scheduled.',
  },
  {
    key: 'appendix', name: 'How to read this', pages: 1,
    what: 'What each part of a finding page means. Worth including for a client who has not had one of these before.',
  },
]

export const DEFAULT_SECTIONS: SectionChoice[] = [
  { key: 'cover', on: true },
  { key: 'brief', on: true },
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
  // Each missing section goes in after the section the catalogue puts before
  // it, so it is in a sensible place when someone switches it on.
  const all = [...kept]
  CATALOGUE.forEach((c, i) => {
    if (seen.has(c.key)) return
    const prev = CATALOGUE.slice(0, i).reverse().find((p) => all.some((s) => s.key === p.key))
    const at = prev ? all.findIndex((s) => s.key === prev.key) + 1 : 0
    all.splice(at, 0, { key: c.key, on: false })
  })

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
