import type { Audit, Brand, Example, FindingFull } from '../lib/types'

/**
 * The canonical record shape. Nested by field group, matching the published
 * schema, because the flat views (CSV, Sheets) are projections of this and
 * not the other way round.
 */
export function toRecord(f: FindingFull) {
  return {
    identity: { id: f.ref, title: f.title, pillar: f.pillar, raised: f.raised },
    scope: {
      urls_affected: f.urls_affected,
      templates: f.templates,
      markets: f.markets,
    },
    evidence: {
      measurements: f.measurements,
      source: f.source,
      collected: { from: f.collected_from, to: f.collected_to },
      examples: f.examples.map(exampleRecord),
      confidence: f.confidence ? { level: f.confidence, reason: f.confidence_reason } : null,
    },
    impact: {
      impact_type: f.impact_type,
      metric_at_risk: f.metric_at_risk,
      quantity:
        f.quantity_value == null ? null : { value: f.quantity_value, unit: f.quantity_unit },
      impact_basis: f.impact_basis,
      time_horizon: f.time_horizon,
      affects: f.affects,
    },
    remedy: {
      action: f.action,
      steps: f.steps,
      owner: f.owner,
      effort_days: f.effort_days,
      dependencies: f.dependencies,
      wave: f.wave,
    },
    risk: {
      blast_radius: f.blast_radius,
      failure_likelihood: f.failure_likelihood,
      reversibility: f.reversibility,
      risk_factor: f.risk_factor,
    },
    priority: {
      severity_weight: f.severity_weight,
      reach: f.reach,
      confidence_factor: f.confidence_factor,
      leverage: f.leverage,
      score: f.score,
      band: f.band,
    },
    lifecycle: {
      status: f.status,
      verification_method: f.verification_method,
      verify_by: f.verify_by,
      verified_on: f.verified_on,
      closed_note: f.closed_note,
    },
  }
}

/** Only the keys that kind actually uses, so the JSON stays readable. */
function exampleRecord(e: Example) {
  const base = {
    kind: e.kind,
    caption: e.caption,
    captured: e.captured,
    redacted: e.redacted,
  }
  switch (e.kind) {
    case 'page_element':
      return {
        ...base,
        url: e.url,
        selector: e.selector,
        viewport: e.viewport_w && e.viewport_h ? [e.viewport_w, e.viewport_h] : null,
        margin: { top: e.margin_top, bottom: e.margin_bottom },
        label: e.label,
        image: e.image_path,
      }
    case 'markup':
      return { ...base, url: e.url, extract: e.extract, highlight_lines: e.highlight_lines }
    case 'response':
      return {
        ...base,
        url: e.url,
        request: e.request,
        extract: e.extract,
        highlight_lines: e.highlight_lines,
      }
    case 'serp':
      return {
        ...base,
        query: e.query,
        surface: e.surface,
        label: e.label,
        image: e.image_path,
        reproducible: e.reproducible,
      }
  }
}

export function toDocument(brand: Brand, audit: Audit, findings: FindingFull[]) {
  return {
    document: {
      brand: { name: brand.name, domain: brand.domain },
      audit: {
        title: audit.title,
        status: audit.status,
        scope: audit.scope_note,
        sources: audit.sources,
        gaps: audit.gaps,
        urls_crawled: audit.urls_crawled,
        delivered_on: audit.delivered_on,
      },
      generated: new Date().toISOString(),
      finding_count: findings.length,
    },
    findings: findings.map(toRecord),
  }
}

/** The flat projection. One row per finding, stable column order. */
export const CSV_COLUMNS = [
  'ref', 'title', 'pillar', 'band', 'score', 'status',
  'urls_affected', 'templates', 'markets',
  'impact_type', 'metric_at_risk', 'quantity_value', 'quantity_unit', 'impact_basis',
  'action', 'owner', 'effort_days', 'wave', 'dependencies',
  'severity_weight', 'reach', 'confidence_factor', 'leverage', 'risk_factor',
  'blast_radius', 'failure_likelihood', 'reversibility',
  'confidence', 'source', 'collected_from', 'collected_to', 'example_count',
  'verification_method', 'verify_by', 'verified_on', 'raised',
] as const

export function toRow(f: FindingFull): (string | number | null)[] {
  const j = (a: string[]) => (a.length ? a.join('; ') : null)
  return [
    f.ref, f.title, f.pillar, f.band, f.score, f.status,
    f.urls_affected, j(f.templates), j(f.markets),
    f.impact_type, f.metric_at_risk, f.quantity_value, f.quantity_unit, f.impact_basis,
    f.action, f.owner, f.effort_days, f.wave, j(f.dependencies),
    f.severity_weight, f.reach, f.confidence_factor, f.leverage, f.risk_factor,
    f.blast_radius, f.failure_likelihood, f.reversibility,
    f.confidence, j(f.source), f.collected_from, f.collected_to, f.examples.length,
    f.verification_method, f.verify_by, f.verified_on, f.raised,
  ]
}

export function toCsv(findings: FindingFull[]): string {
  const esc = (v: string | number | null) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [CSV_COLUMNS.join(',')]
  for (const f of findings) lines.push(toRow(f).map(esc).join(','))
  return lines.join('\n')
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
