import type { Audit, FindingFull } from './types'
import { scopeOf } from './scope'

/**
 * The audit's own layer, shown on its Overview tab: the brief it answers, the
 * numbers it is judged on and where they stood at the start, what it covers,
 * and what it concluded across its findings.
 *
 * The json columns are read through these functions, which repair a missing
 * or partial value, so an audit written before the overview existed, or by an
 * agent over the API, still renders.
 */

/** A number the audit is judged on. The baseline is typed by a person, with
 *  the date and the source it came from. It is never estimated. */
export interface Kpi {
  id: string
  name: string
  unit: string
  baseline: number | null
  as_of: string | null
  source: string | null
}

export interface AuditScope {
  hosts: string[]
  markets: string[]
  templates: string[]
  devices: string[]
  excluded: string[]
}

/** A root cause the findings group under. A finding sits in one at most. */
export interface Theme {
  id: string
  title: string
  note: string
  finding_ids: string[]
}

export const DEVICES = ['Desktop', 'Mobile', 'Tablet']

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export function kpisOf(audit: Audit | null): Kpi[] {
  const raw = Array.isArray(audit?.kpis) ? (audit!.kpis as Record<string, unknown>[]) : []
  return raw.filter((k) => k && typeof k === 'object').map((k, i) => ({
    id: str(k.id) || `k${i + 1}`,
    name: str(k.name),
    unit: str(k.unit),
    baseline: num(k.baseline),
    as_of: str(k.as_of) || null,
    source: str(k.source) || null,
  }))
}

export function auditScopeOf(audit: Audit | null): AuditScope {
  const s = (audit?.scope && typeof audit.scope === 'object' && !Array.isArray(audit.scope)
    ? audit.scope : {}) as Record<string, unknown>
  return {
    hosts: strs(s.hosts),
    markets: strs(s.markets),
    templates: strs(s.templates),
    devices: strs(s.devices),
    excluded: strs(s.excluded),
  }
}

export function themesOf(audit: Audit | null): Theme[] {
  const raw = Array.isArray(audit?.themes) ? (audit!.themes as Record<string, unknown>[]) : []
  return raw.filter((t) => t && typeof t === 'object').map((t, i) => ({
    id: str(t.id) || `t${i + 1}`,
    title: str(t.title),
    note: str(t.note),
    finding_ids: strs(t.finding_ids),
  }))
}

const has = (v: string | null | undefined) => Boolean(v && v.trim())

/** How much of each part is filled in, for the rows on the Overview tab. */
export function progress(audit: Audit, findings: FindingFull[]) {
  const kpis = kpisOf(audit)
  const scope = auditScopeOf(audit)
  const themes = themesOf(audit)
  const named = kpis.filter((k) => has(k.name))
  const measured = named.filter((k) => k.baseline != null && has(k.as_of) && has(k.source))
  const ids = new Set(findings.map((f) => f.id))
  const grouped = new Set(themes.flatMap((t) => t.finding_ids).filter((id) => ids.has(id)))
  return {
    brief: {
      done: [has(audit.question), has(audit.objective), named.length > 0, has(audit.commissioned_by)].filter(Boolean).length,
      of: 4,
    },
    scope: {
      done: [scope.hosts.length > 0, scope.markets.length > 0, scope.templates.length > 0, scope.devices.length > 0].filter(Boolean).length,
      of: 4,
    },
    baseline: { done: measured.length, of: named.length },
    summary: {
      written: has(audit.summary),
      themes: themes.filter((t) => has(t.title)).length,
      grouped: grouped.size,
      findings: findings.length,
    },
  }
}

/** The host of a URL, lower case, without a leading www. Null when it is not
 *  a URL. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * A host as typed on the scope, as a rule. A bare domain covers its
 * subdomains; one typed with www covers only itself, with or without the www,
 * so naming www.example.com does not pull help.example.com into scope.
 */
function hostRule(typed: string): (host: string) => boolean {
  const t = typed.trim().toLowerCase()
  let full: string
  try {
    full = new URL(/^[a-z]+:\/\//.test(t) ? t : `https://${t}`).hostname
  } catch {
    full = t
  }
  const base = full.replace(/^www\./, '')
  const wild = !full.startsWith('www.')
  return (host) => host === base || (wild && host.endsWith(`.${base}`))
}

/**
 * Where a finding goes beyond the audit's scope, one line per reason. Only
 * the parts of the scope that are filled in are checked: a scope that names
 * no markets says nothing about markets.
 */
export function outOfScope(f: FindingFull, audit: Audit): string[] {
  const s = auditScopeOf(audit)
  const out: string[] = []
  if (s.markets.length) {
    const inScope = new Set(s.markets.map((m) => m.toLowerCase()))
    const extra = (f.markets ?? []).filter((m) => !inScope.has(m.toLowerCase()))
    if (extra.length) out.push(`${extra.length === 1 ? 'Market' : 'Markets'} ${extra.join(', ')}`)
  }
  const segs = scopeOf(f.scope).segments
  if (s.templates.length) {
    const inScope = new Set(s.templates.map((t) => t.toLowerCase()))
    const extra = segs.filter((g) => g.type === 'template' && g.name && !inScope.has(g.name.toLowerCase()))
      .map((g) => g.name as string)
    if (extra.length) out.push(`${extra.length === 1 ? 'Template' : 'Templates'} ${extra.join(', ')}`)
  }
  if (s.hosts.length) {
    const rules = s.hosts.map(hostRule)
    const ok = (h: string) => rules.some((r) => r(h))
    const urls = segs.filter((g) => g.type === 'pages').flatMap((g) => g.urls ?? [])
    const extra = [...new Set(urls.map(hostOf).filter((h): h is string => Boolean(h) && !ok(h as string)))]
    if (extra.length) out.push(`${extra.length === 1 ? 'Host' : 'Hosts'} ${extra.join(', ')}`)
  }
  return out
}

/** Format a baseline for reading: thousands separated, unit after. */
export function baselineText(k: Kpi): string {
  if (k.baseline == null) return 'Not measured'
  const n = Number.isInteger(k.baseline) ? k.baseline.toLocaleString('en-US') : String(k.baseline)
  return k.unit ? `${n} ${k.unit}` : n
}
