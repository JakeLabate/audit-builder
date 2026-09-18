import type { Brand, Finding, FindingFull } from './types'

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
  pillars: { name: string; code: string }[]
  templates: { name: string; universe: number }[]
  markets: string[]
  owners: string[]
  metrics: string[]
  units: string[]
  crawl_cycle_days: number
}

const EMPTY: Registry = {
  pillars: [], templates: [], markets: [], owners: [], metrics: [], units: [],
  crawl_cycle_days: 42,
}

export function registryOf(brand: Brand | null): Registry {
  const r = (brand?.registry ?? {}) as Partial<Registry>
  return {
    pillars: r.pillars ?? EMPTY.pillars,
    templates: r.templates ?? EMPTY.templates,
    markets: r.markets ?? EMPTY.markets,
    owners: r.owners ?? EMPTY.owners,
    metrics: r.metrics ?? EMPTY.metrics,
    units: r.units ?? EMPTY.units,
    crawl_cycle_days: r.crawl_cycle_days ?? EMPTY.crawl_cycle_days,
  }
}

const n = (x: number) => x.toLocaleString('en-US')

/** The effort scale. Continuous days invite 0.375, which is false precision on
 *  the field that dominates the score. */
export const EFFORT_BUCKETS = [0.25, 0.5, 1, 2, 3, 5, 8, 13]

/** ref: {PILLAR}-{NNN}, sequence per audit per pillar. */
export function deriveRef(
  pillar: string | null,
  reg: Registry,
  taken: string[],
  currentRef: string,
): Derived<string> {
  const code = reg.pillars.find((p) => p.name === pillar)?.code
  if (!code) {
    return { value: currentRef, how: 'Pick a pillar and the reference is issued from its code.' }
  }
  if (currentRef.startsWith(code + '-')) {
    return { value: currentRef, how: `Issued from the ${pillar} pillar, whose code is ${code}.` }
  }
  const used = new Set(taken)
  let i = 1
  while (used.has(`${code}-${String(i).padStart(3, '0')}`)) i++
  const next = `${code}-${String(i).padStart(3, '0')}`
  return {
    value: next,
    how: `${pillar} carries the code ${code}. ${i - 1} already issued in this audit, so this one is ${next}.`,
  }
}

/** collection window: the span the measurements actually cover. */
export function deriveWindow(f: Finding): Derived<{ from: string | null; to: string | null }> {
  const dates = f.measurements.map((m) => m.taken).filter(Boolean).sort()
  if (dates.length === 0) {
    return {
      value: { from: null, to: null },
      how: 'No measurements yet, so there is no window to read.',
    }
  }
  const from = dates[0], to = dates[dates.length - 1]
  return {
    value: { from, to },
    how: dates.length === 1
      ? `One measurement, taken ${from}, so the window is that day.`
      : `Earliest and latest of ${dates.length} measurement dates: ${from} to ${to}.`,
  }
}

/** reach: affected URLs over the universe of the templates it touches. */
export function deriveReach(f: Finding, reg: Registry): Derived<number | null> {
  if (f.urls_affected == null) {
    return { value: null, how: 'Needs urls_affected, which comes off the crawl.' }
  }
  const hit = reg.templates.filter((t) => f.templates.includes(t.name))
  if (hit.length === 0) {
    return { value: null, how: 'Needs at least one template with a known universe in the brand registry.' }
  }
  const universe = hit.reduce((s, t) => s + t.universe, 0)
  if (universe <= 0) return { value: null, how: 'That template universe is zero.' }
  const v = Math.min(1, Math.round((f.urls_affected / universe) * 1000) / 1000)
  return {
    value: v,
    how: `${n(f.urls_affected)} affected of ${n(universe)} across ${hit.map((t) => t.name).join(' and ')} = ${v}.`,
  }
}

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

/** verify_by: one crawl cycle after it was raised, per this brand's cadence. */
export function deriveVerifyBy(f: Finding, reg: Registry): Derived<string | null> {
  if (!f.raised) return { value: null, how: 'Needs the raised date.' }
  const d = new Date(f.raised + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + reg.crawl_cycle_days)
  const v = d.toISOString().slice(0, 10)
  return {
    value: v,
    how: `Raised ${f.raised} plus this brand's ${reg.crawl_cycle_days} day crawl cycle.`,
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
    out.push(`Confidence is ${f.confidence}, so the reason has to say why it is not high.`)
  if (f.quantity_value != null && !f.impact_basis?.trim())
    out.push('You asserted a quantity. Impact basis has to say where it came from.')
  if (['fixed', 'verified', 'accepted_risk'].includes(f.status) && !f.closed_note?.trim())
    out.push(`Status is ${f.status.replace('_', ' ')}, so the closing note has to say what changed.`)
  if ((f.verified_on != null) !== (f.status === 'verified'))
    out.push('Verified on and a status of verified go together. One without the other is not a real state.')
  if (f.collected_to && f.raised && f.collected_to > f.raised)
    out.push('The collection window ends after the date the finding was raised.')
  return out
}
