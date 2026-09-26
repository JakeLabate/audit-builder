import type { Audit, FindingFull } from './types'
import { BAND_LABEL } from './score'

/**
 * The spreadsheet's columns.
 *
 * Each one carries a `note`, printed as a second row under the header. A
 * register goes to people who were not in the audit, and a bare header like
 * "Reach" tells them nothing. The note is the difference between a file
 * somebody uses and a file somebody asks you about.
 */

const title = (s: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''

export interface SheetCol {
  key: string
  header: string
  /** The row under the header. What this column means, in a sentence. */
  note: string
  width: number
  /** Long prose wraps; short values stay on one line. */
  wrap?: boolean
  value: (f: FindingFull) => string | number
}

export const SHEET_COLUMNS: SheetCol[] = [
  { key: 'ref', header: 'Ref', note: 'Permanent ID for this finding.', width: 90,
    value: (f) => f.ref },
  { key: 'title', header: 'Finding', note: 'What is wrong, stated as a claim you can agree or disagree with.', width: 340, wrap: true,
    value: (f) => f.title },
  { key: 'band', header: 'Priority', note: 'P1 do first, P2 scheduled, P3 alongside, P4 monitor.', width: 90,
    value: (f) => f.band ?? '' },
  { key: 'score', header: 'Score', note: '0 to 100, computed.', width: 70,
    value: (f) => f.score ?? '' },
  { key: 'status', header: 'Status', note: 'Where the fix stands right now.', width: 140,
    value: (f) => title(f.status) },
  { key: 'owner', header: 'Owner', note: 'The team that can make this change. A team, not a person.', width: 150,
    value: (f) => f.owner ?? '' },
  { key: 'effort_days', header: 'Effort, days', note: 'Engineering days, estimated.', width: 110,
    value: (f) => f.effort_days ?? '' },
  { key: 'wave', header: 'Wave', note: 'Roadmap phase.', width: 70,
    value: (f) => f.wave ?? '' },
  { key: 'urls_affected', header: 'URLs affected', note: 'URLs with the problem.', width: 120,
    value: (f) => f.urls_affected ?? '' },
  { key: 'templates', header: 'Templates', note: 'Which page templates are hit. A template problem is one fix.', width: 170, wrap: true,
    value: (f) => f.templates.join(', ') },
  { key: 'impact_basis', header: 'What it costs', note: 'The exposure, and where that number came from.', width: 380, wrap: true,
    value: (f) => f.impact_basis ?? '' },
  { key: 'action', header: 'The fix', note: 'What to do, written as an instruction to the owner.', width: 380, wrap: true,
    value: (f) => f.action ?? '' },
  { key: 'verification_method', header: 'How it will be verified', note: 'The check that proves it fixed. Written before the fix, not after.', width: 330, wrap: true,
    value: (f) => f.verification_method ?? '' },
  { key: 'verify_by', header: 'Verify by', note: 'When to run that check.', width: 110,
    value: (f) => f.verify_by ?? '' },

  /* Off by default. Available when the register needs to carry more. */
  { key: 'pillar', header: 'Pillar', note: 'Which area of the audit this came from.', width: 150,
    value: (f) => f.pillar ?? '' },
  { key: 'markets', header: 'Markets', note: 'Which locales or country sites are affected.', width: 120,
    value: (f) => f.markets.join(', ') },
  { key: 'impact_type', header: 'Kind of harm', note: 'Crawl waste, duplicate content, lost visibility, broken experience or compliance.', width: 160,
    value: (f) => title(f.impact_type) },
  { key: 'metric_at_risk', header: 'Metric at risk', note: 'Which measure moves if this is not fixed.', width: 220, wrap: true,
    value: (f) => f.metric_at_risk ?? '' },
  { key: 'quantity', header: 'Exposure', note: 'The size of the problem, with its unit.', width: 150,
    value: (f) => (f.quantity_value != null ? `${f.quantity_value} ${f.quantity_unit ?? ''}`.trim() : '') },
  { key: 'time_horizon', header: 'When it bites', note: 'Already happening, next crawl cycle, next release, or latent.', width: 150,
    value: (f) => title(f.time_horizon) },
  { key: 'confidence', header: 'Confidence', note: 'How strongly the evidence supports the claim, and why if not high.', width: 200, wrap: true,
    value: (f) => (f.confidence ? title(f.confidence) + (f.confidence_reason ? `. ${f.confidence_reason}` : '') : '') },
  { key: 'collected', header: 'Data window', note: 'The span the evidence covers. Without it nobody can re-verify.', width: 150,
    value: (f) => (f.collected_from && f.collected_to ? `${f.collected_from} to ${f.collected_to}` : '') },
  { key: 'sources', header: 'Sources', note: 'The tools and datasets the finding was built from.', width: 240, wrap: true,
    value: (f) => f.source.join(', ') },
  { key: 'steps', header: 'Steps', note: 'The fix broken down so an engineer needs no follow-up question.', width: 420, wrap: true,
    value: (f) => f.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') },
  { key: 'depends_on', header: 'Blocked by', note: 'Findings that have to land before this one can start.', width: 140,
    value: () => '' },
  { key: 'blockers', header: 'External blockers', note: 'Things holding it up that are not findings: a window, a sign off.', width: 220, wrap: true,
    value: (f) => (f.external_blockers ?? []).join(', ') },
  { key: 'severity', header: 'Severity', note: '1 to 5, how bad on its own.', width: 90,
    value: (f) => f.severity_weight ?? '' },
  { key: 'reach', header: 'Reach', note: 'Share of pages hit.', width: 80,
    value: (f) => f.reach ?? '' },
  { key: 'leverage', header: 'Leverage', note: '1 to 5, what it unblocks.', width: 90,
    value: (f) => f.leverage ?? '' },
  { key: 'risk', header: 'Fix risk', note: 'Risk of the fix itself.', width: 110,
    value: (f) => f.risk_factor ?? '' },
  { key: 'decision', header: 'Decision', note: 'The client call on the recommendation: accepted, deferred or rejected.', width: 130,
    value: (f) => title((f as unknown as { decision: string | null }).decision ?? null) },
  { key: 'verified_on', header: 'Verified on', note: 'When it was confirmed.', width: 120,
    value: (f) => f.verified_on ?? '' },
  { key: 'closed_note', header: 'What changed', note: 'What happened, in plain words, for whoever reads this later.', width: 320, wrap: true,
    value: (f) => f.closed_note ?? '' },
]

export interface ColChoice { key: string; on: boolean }

export const DEFAULT_COLUMNS: ColChoice[] = SHEET_COLUMNS.map((c, i) => ({
  key: c.key, on: i < 14,
}))

/** What the audit stored, repaired: unknown keys dropped, new ones appended off. */
export function columnsOf(audit: Audit | null): ColChoice[] {
  const raw = Array.isArray((audit as unknown as { sheet_columns?: ColChoice[] })?.sheet_columns)
    ? ((audit as unknown as { sheet_columns: ColChoice[] }).sheet_columns)
    : null
  if (!raw) return [...DEFAULT_COLUMNS]
  const known = new Map(SHEET_COLUMNS.map((c) => [c.key, c]))
  const kept = raw.filter((c) => c && known.has(c.key))
  const seen = new Set(kept.map((c) => c.key))
  return [...kept, ...SHEET_COLUMNS.filter((c) => !seen.has(c.key)).map((c) => ({ key: c.key, on: false }))]
}

/** The chosen columns, in order, ready to render. Never empty: a register with
 *  no columns is not a document, so the reference is always kept. */
export function resolveColumns(audit: Audit | null): SheetCol[] {
  const by = new Map(SHEET_COLUMNS.map((c) => [c.key, c]))
  const out = columnsOf(audit).filter((c) => c.on).map((c) => by.get(c.key)!).filter(Boolean)
  return out.length ? out : [by.get('ref')!]
}

/** Dependencies are ids in the record and refs in a document. */
export function withRefs(cols: SheetCol[], all: FindingFull[]): SheetCol[] {
  const ref = new Map(all.map((f) => [f.id, f.ref]))
  return cols.map((c) =>
    c.key === 'depends_on'
      ? { ...c, value: (f: FindingFull) => (f.depends_on ?? []).map((id) => ref.get(id) ?? '?').join(', ') }
      : c,
  )
}

export { BAND_LABEL }
