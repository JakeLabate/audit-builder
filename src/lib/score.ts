import type { Finding, PriorityBand } from './types'

/**
 * The priority formula. This mirrors the `finding_scores` view in Postgres
 * so the number shown while editing matches the number the database computes
 * once the row is saved. If one changes, change both.
 *
 * Effort sits under a square root on purpose: a fix taking four times as long
 * is penalised twice, not four times. Dividing directly would make the
 * register recommend nothing but trivia.
 */
export function riskFactor(f: Pick<Finding, 'blast_radius' | 'failure_likelihood' | 'reversibility'>): number {
  const blast = f.blast_radius ?? 2
  const fail = f.failure_likelihood ?? 2
  const rev = f.reversibility ?? 1
  const raw = 1.3 - (blast + fail) / 20 - rev / 20
  return Math.round(Math.min(1.2, Math.max(0.6, raw)) * 100) / 100
}

export function score(f: Finding): number | null {
  if (f.severity_weight == null || f.effort_days == null || f.effort_days <= 0) return null
  const raw =
    (f.severity_weight * (f.reach ?? 1) * (f.confidence_factor ?? 1) * (f.leverage ?? 1)) /
    Math.sqrt(f.effort_days) *
    riskFactor(f) *
    3
  return Math.min(100, Math.round(raw))
}

/**
 * Where a finding sits in its own audit.
 *
 * Fixed thresholds on the score put most findings in P4 and the report
 * printed that as "Monitor". The product term spans roughly a hundred to one
 * between a severe high leverage finding and an ordinary one, while the bands
 * were linear slices of 0 to 100, so only the extreme ever cleared 80. An
 * audit where nothing is catastrophic read as though nothing mattered.
 *
 * A band is now the share of the audit at or below you. Cut on the cumulative
 * distribution rather than on percentile values, because scores tie a lot and
 * a value cutoff landing inside a tie block empties a whole band. Equal
 * scores always get equal bands.
 *
 * This mirrors the `finding_scores` view in Postgres. If one changes, change
 * both, and check them against each other.
 */
const CUTS: [number, PriorityBand][] = [[0.85, 'P1'], [0.60, 'P2'], [0.30, 'P3']]

/** The absolute fallback, for an audit with nothing to rank against. */
export function absoluteBand(s: number | null): PriorityBand | null {
  if (s == null) return null
  if (s >= 80) return 'P1'
  if (s >= 55) return 'P2'
  if (s >= 30) return 'P3'
  return 'P4'
}

/**
 * Bands for a whole audit at once, which is the only way a relative band can
 * be worked out. The population is the client-facing findings: an internal
 * note is not in the deliverable, so letting it pad the bottom would quietly
 * promote everything the client does see.
 */
export function bandsFor(
  rows: { id: string; score: number | null; exposure?: string }[],
): Map<string, PriorityBand | null> {
  const pop = rows
    .filter((r) => r.score != null && r.exposure !== 'internal')
    .map((r) => r.score as number)
    .sort((a, b) => a - b)

  const out = new Map<string, PriorityBand | null>()
  const flat = pop.length === 0 || pop[0] === pop[pop.length - 1]

  for (const r of rows) {
    if (r.score == null) { out.set(r.id, null); continue }
    if (flat) { out.set(r.id, absoluteBand(r.score)); continue }
    // Share of the population at or below this score.
    let atOrBelow = 0
    for (const s of pop) { if (s <= (r.score as number)) atOrBelow++; else break }
    const cume = atOrBelow / pop.length
    out.set(r.id, CUTS.find(([c]) => cume > c)?.[1] ?? 'P4')
  }
  return out
}

export const BAND_LABEL: Record<PriorityBand, string> = {
  P1: 'Do this first',
  P2: 'Scheduled work',
  P3: 'Do alongside',
  P4: 'Monitor',
}

/**
 * The one field the app refuses to let you skip. Every asserted number
 * has to state where it came from, which is the promise the document makes.
 */
export function missingRequirements(f: Finding): string[] {
  const out: string[] = []
  if (!f.title.trim()) out.push('A finding needs a title stated as a claim.')
  if (f.quantity_value != null && !f.impact_basis?.trim())
    out.push('You asserted a quantity. impact_basis has to say where it came from.')
  if (f.severity_weight == null) out.push('Severity weight is unset, so no score can be computed.')
  if (f.effort_days == null) out.push('Effort is unset, so no score can be computed.')
  if (!f.verification_method?.trim())
    out.push('Verification method is written before the fix, not after.')
  return out
}
