import type { Brand, Finding, FindingFull } from './types'
import { isCategoryPath, nextRefFor, refMatches, UNCATEGORIZED } from './taxonomy'

/**
 * Every rule that turns something the consultant already knows into a field
 * they would otherwise type. Each one returns the value AND the sentence that
 * explains it, because a derived field nobody can interrogate is worse than a
 * typed one: at least a typed number has an author.
 */

export interface Derived<T> {
  value: T
  how: string
}

export interface Registry {
  /** Legacy. Categories are universal now; see taxonomy.ts. */
  pillars: { name: string; code: string }[]
  /** Names only. Older brands still carry a page count, which nothing reads. */
  templates: { name: string; universe?: number }[]
  components: { name: string }[]
  markets: string[]
  owners: string[]
  metrics: string[]
  units: string[]
  crawl_cycle_days: number
}

const EMPTY: Registry = {
  pillars: [], templates: [], components: [], markets: [], owners: [], metrics: [], units: [],
  crawl_cycle_days: 42,
}

export function registryOf(brand: Brand | null): Registry {
  const r = (brand?.registry ?? {}) as Partial<Registry>
  return {
    pillars: r.pillars ?? EMPTY.pillars,
    templates: r.templates ?? EMPTY.templates,
    components: r.components ?? EMPTY.components,
    markets: r.markets ?? EMPTY.markets,
    owners: r.owners ?? EMPTY.owners,
    metrics: r.metrics ?? EMPTY.metrics,
    units: r.units ?? EMPTY.units,
    crawl_cycle_days: r.crawl_cycle_days ?? EMPTY.crawl_cycle_days,
  }
}

/** The effort scale. Continuous days invite 0.375, which is false precision on
 *  the field that dominates the score. */
export const EFFORT_BUCKETS = [0.25, 0.5, 1, 2, 3, 5, 8, 13]

/** ref: Category/Subcategory/n, numbered per audit within each subcategory. */
export function deriveRef(
  category: string | null,
  taken: string[],
  currentRef: string,
): Derived<string> {
  if (!isCategoryPath(category)) {
    const v = refMatches(currentRef, null) ? currentRef : nextRefFor(null, taken)
    return { value: v, how: 'Pick a category and the reference is issued from it.' }
  }
  if (refMatches(currentRef, category)) {
    return { value: currentRef, how: `Issued from ${category}.` }
  }
  const next = nextRefFor(category, taken)
  const n = Number(next.split('/').pop()) - 1
  return {
    value: next,
    how: `${n} already issued under ${category} in this audit, so this one is ${next}.`,
  }
}

export { UNCATEGORIZED }

/** confidence_factor: one idea, not two. */
const CF: Record<string, number> = { high: 1, medium: 0.8, low: 0.6 }
export function deriveConfidenceFactor(f: Finding): Derived<number | null> {
  if (!f.confidence) return { value: null, how: 'Set confidence and the factor follows it.' }
  const v = CF[f.confidence]
  return { value: v, how: `Confidence is ${f.confidence}, so the factor is ${v.toFixed(1)}.` }
}

/** leverage: how many findings this one unblocks. That is the graph's answer. */
export function deriveLeverage(f: Finding, all: FindingFull[]): Derived<number> {
  const blocked = all.filter((o) => o.id !== f.id && (o.depends_on ?? []).includes(f.id))
  const v = Math.min(5, 1 + blocked.length)
  return {
    value: v,
    how: blocked.length === 0
      ? 'Nothing waits on this one, so leverage sits at the floor of 1.'
      : `${blocked.length} finding${blocked.length > 1 ? 's' : ''} cannot start until this lands (${blocked.map((b) => b.ref).join(', ')}), so 1 + ${blocked.length} = ${v}.`,
  }
}

/** wave: the band wants it early, the dependency graph says how early it can be. */
const BAND_WAVE: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 }
export function deriveWave(
  f: Finding, band: string | null, all: FindingFull[], depth = 0,
): Derived<number | null> {
  if (!band) return { value: null, how: 'Needs a score, which needs severity and effort.' }
  const want = BAND_WAVE[band]
  const deps = (f.depends_on ?? [])
    .map((id) => all.find((o) => o.id === id))
    .filter(Boolean) as FindingFull[]
  if (deps.length === 0) {
    return { value: want, how: `${band} puts it in wave ${want}, and nothing blocks it.` }
  }
  const depWaves = deps.map((d) =>
    depth > 6 ? 1 : (deriveWave(d, d.band, all, depth + 1).value ?? 1),
  )
  const floor = Math.max(...depWaves) + 1
  const v = Math.min(6, Math.max(want, floor))
  return {
    value: v,
    how: v > want
      ? `${band} wants wave ${want}, but it waits on ${deps.map((d) => d.ref).join(', ')} in wave ${floor - 1}, so it lands in ${v}.`
      : `${band} puts it in wave ${want}, and its blockers clear before then.`,
  }
}

/** verify_by: one crawl cycle after it was found, per this brand's cadence. */
export function deriveVerifyBy(f: Finding, reg: Registry): Derived<string | null> {
  if (!f.raised) return { value: null, how: 'Needs the Found on date.' }
  const d = new Date(f.raised + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + reg.crawl_cycle_days)
  const v = d.toISOString().slice(0, 10)
  return {
    value: v,
    how: `Found on ${f.raised} plus this brand's ${reg.crawl_cycle_days} day crawl cycle.`,
  }
}

/** The legal next moves. A finding cannot reach verified without being fixed. */
export const NEXT_STATUS: Record<string, string[]> = {
  open: ['in_progress', 'fixed', 'accepted_risk'],
  in_progress: ['open', 'fixed', 'accepted_risk'],
  fixed: ['verified', 'reopened', 'in_progress', 'accepted_risk'],
  verified: ['reopened', 'accepted_risk'],
  reopened: ['in_progress', 'fixed', 'accepted_risk'],
  accepted_risk: ['open', 'in_progress'],
}

/** What the record refuses to save, and why. Mirrors the database triggers. */
export function blockers(f: Finding): string[] {
  const out: string[] = []
  if (!f.title.trim()) out.push('A finding needs a title stated as a claim.')
  if (f.confidence && f.confidence !== 'high' && !f.confidence_reason?.trim())
    out.push(`Confidence is ${f.confidence}, so the confidence reason has to say why it is not high.`)
  if (f.quantity_value != null && !f.impact_basis?.trim())
    out.push('You asserted a quantity. Impact basis has to say where it came from.')
  if (['fixed', 'verified', 'accepted_risk'].includes(f.status) && !f.closed_note?.trim())
    out.push(`Status is ${f.status.replace('_', ' ')}, so the closing note has to say what changed.`)
  if ((f.verified_on != null) !== (f.status === 'verified'))
    out.push('Verified on and a status of verified go together. One without the other is not a real state.')
  if (f.collected_from && f.collected_to && f.collected_from > f.collected_to)
    out.push('The evidence window runs backwards.')
  return out
}
