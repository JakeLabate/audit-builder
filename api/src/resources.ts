/**
 * The resource handlers. Each one is a plain function over (env, ctx, input)
 * so the REST router and the MCP layer can call exactly the same code. There
 * is no second implementation to keep in step.
 */
import { ApiError, insert, patch, remove, rpc, scoped, type Env } from './db'

export interface Ctx { org: string; scopes: string[]; keyId: string }

const needWrite = (ctx: Ctx) => {
  if (!ctx.scopes.includes('write')) throw new ApiError(403, 'This key is read only.')
}

const cap = (env: Env, n: unknown) =>
  Math.max(1, Math.min(Number(env.MAX_PAGE ?? 200), Number(n) || 50))

const FINDING_SELECT = '*,examples(*)'

/* ------------------------------------------------------------------ brands */
export const brands = {
  async list(env: Env, ctx: Ctx) {
    return scoped(env, ctx.org, 'brands', 'order=name')
  },
  async get(env: Env, ctx: Ctx, id: string) {
    const b = await scoped(env, ctx.org, 'brands', `id=eq.${id}`, true)
    if (!b) throw new ApiError(404, `No brand with id ${id}.`)
    return b
  },
  async create(env: Env, ctx: Ctx, body: Record<string, unknown>) {
    needWrite(ctx)
    if (!body.name) throw new ApiError(400, 'A brand needs a name.')
    return insert(env, ctx.org, 'brands', body)
  },
  async update(env: Env, ctx: Ctx, id: string, body: Record<string, unknown>) {
    needWrite(ctx)
    return patch(env, ctx.org, 'brands', id, body)
  },
  async remove(env: Env, ctx: Ctx, id: string) {
    needWrite(ctx)
    await remove(env, ctx.org, 'brands', id)
    return { deleted: id }
  },
}

/* ------------------------------------------------------------------ audits */
export const audits = {
  async list(env: Env, ctx: Ctx, q: URLSearchParams) {
    const bits = ['order=created_at.desc', `limit=${cap(env, q.get('limit'))}`]
    if (q.get('brand_id')) bits.push(`brand_id=eq.${q.get('brand_id')}`)
    if (q.get('status')) bits.push(`status=eq.${q.get('status')}`)
    if (q.get('mode')) bits.push(`mode=eq.${q.get('mode')}`)
    return scoped(env, ctx.org, 'audits', bits.join('&'))
  },
  async get(env: Env, ctx: Ctx, id: string) {
    const a = await scoped(env, ctx.org, 'audits', `id=eq.${id}`, true)
    if (!a) throw new ApiError(404, `No audit with id ${id}.`)
    return a
  },
  async create(env: Env, ctx: Ctx, body: Record<string, unknown>) {
    needWrite(ctx)
    if (!body.brand_id) throw new ApiError(400, 'An audit needs a brand_id.')
    if (!body.title) throw new ApiError(400, 'An audit needs a title.')
    return insert(env, ctx.org, 'audits', body)
  },
  async update(env: Env, ctx: Ctx, id: string, body: Record<string, unknown>) {
    needWrite(ctx)
    return patch(env, ctx.org, 'audits', id, body)
  },
  async remove(env: Env, ctx: Ctx, id: string) {
    needWrite(ctx)
    await remove(env, ctx.org, 'audits', id)
    return { deleted: id }
  },

  /** The roadmap: findings grouped by wave with effort totalled per wave. */
  async roadmap(env: Env, ctx: Ctx, id: string) {
    await audits.get(env, ctx, id)
    const rows = (await scoped(
      env, ctx.org, 'findings',
      `audit_id=eq.${id}&order=wave.asc,position.asc&select=id,ref,title,wave,effort_days,owner,status,severity_weight`,
    )) as Record<string, unknown>[]
    const waves = new Map<number | null, Record<string, unknown>[]>()
    for (const r of rows) {
      const w = (r.wave as number | null) ?? null
      if (!waves.has(w)) waves.set(w, [])
      waves.get(w)!.push(r)
    }
    return {
      audit_id: id,
      total_effort_days: rows.reduce((s, r) => s + Number(r.effort_days ?? 0), 0),
      waves: [...waves.entries()].map(([wave, items]) => ({
        wave,
        findings: items.length,
        effort_days: items.reduce((s, r) => s + Number(r.effort_days ?? 0), 0),
        items,
      })),
    }
  },
}

/* ---------------------------------------------------------------- findings */
export const findings = {
  async list(env: Env, ctx: Ctx, q: URLSearchParams) {
    const bits = [`select=${FINDING_SELECT}`, 'order=position', `limit=${cap(env, q.get('limit'))}`]
    if (q.get('audit_id')) bits.push(`audit_id=eq.${q.get('audit_id')}`)
    if (q.get('status')) bits.push(`status=eq.${q.get('status')}`)
    if (q.get('pillar')) bits.push(`pillar=eq.${q.get('pillar')}`)
    if (q.get('impact_type')) bits.push(`impact_type=eq.${q.get('impact_type')}`)
    if (q.get('owner')) bits.push(`owner=eq.${q.get('owner')}`)
    if (q.get('wave')) bits.push(`wave=eq.${q.get('wave')}`)
    if (q.get('q')) bits.push(`title=ilike.*${q.get('q')}*`)
    return scoped(env, ctx.org, 'findings', bits.join('&'))
  },
  async get(env: Env, ctx: Ctx, id: string) {
    const f = await scoped(env, ctx.org, 'findings', `id=eq.${id}&select=${FINDING_SELECT}`, true)
    if (!f) throw new ApiError(404, `No finding with id ${id}.`)
    return f
  },
  async create(env: Env, ctx: Ctx, body: Record<string, unknown>) {
    needWrite(ctx)
    if (!body.audit_id) throw new ApiError(400, 'A finding needs an audit_id.')
    if (!body.title) throw new ApiError(400, 'A finding needs a title stated as a claim.')
    if (!body.ref) body.ref = await nextRef(env, ctx, String(body.audit_id), body.pillar)
    return insert(env, ctx.org, 'findings', body)
  },
  async update(env: Env, ctx: Ctx, id: string, body: Record<string, unknown>) {
    needWrite(ctx)
    return patch(env, ctx.org, 'findings', id, body)
  },
  async remove(env: Env, ctx: Ctx, id: string) {
    needWrite(ctx)
    await remove(env, ctx.org, 'findings', id)
    return { deleted: id }
  },
}

/** Mirrors the app: pillar code plus the next free number in this audit. */
async function nextRef(env: Env, ctx: Ctx, auditId: string, pillar: unknown): Promise<string> {
  const code = String(pillar ?? 'GEN')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'GEN'
  const rows = (await scoped(
    env, ctx.org, 'findings', `audit_id=eq.${auditId}&select=ref`,
  )) as Record<string, unknown>[]
  const used = new Set(rows.map((r) => String(r.ref)))
  let n = 1
  while (used.has(`${code}-${String(n).padStart(3, '0')}`)) n++
  return `${code}-${String(n).padStart(3, '0')}`
}

/* ---------------------------------------------------------------- examples */
export const examples = {
  async create(env: Env, ctx: Ctx, body: Record<string, unknown>) {
    needWrite(ctx)
    if (!body.finding_id) throw new ApiError(400, 'An exhibit needs a finding_id.')
    if (!body.kind) throw new ApiError(400, 'An exhibit needs a kind.')
    return insert(env, ctx.org, 'examples', body)
  },
  async update(env: Env, ctx: Ctx, id: string, body: Record<string, unknown>) {
    needWrite(ctx)
    return patch(env, ctx.org, 'examples', id, body)
  },
  async remove(env: Env, ctx: Ctx, id: string) {
    needWrite(ctx)
    await remove(env, ctx.org, 'examples', id)
    return { deleted: id }
  },
}

/* ------------------------------------------------------------------ export */
export const exports_ = {
  async audit(env: Env, ctx: Ctx, id: string, format: string) {
    const audit = (await audits.get(env, ctx, id)) as Record<string, unknown>
    const brand = (await brands.get(env, ctx, String(audit.brand_id))) as Record<string, unknown>
    const rows = (await scoped(
      env, ctx.org, 'findings', `audit_id=eq.${id}&select=${FINDING_SELECT}&order=position`,
    )) as Record<string, unknown>[]

    if (format === 'json') return { brand, audit, findings: rows }
    if (format === 'csv') return { csv: toCsv(rows) }
    if (format === 'markdown') return { markdown: toMarkdown(brand, audit, rows) }
    throw new ApiError(400, `Unknown format "${format}". Use json, csv or markdown.`)
  },
}

const CSV_COLS = [
  'ref', 'title', 'pillar', 'status', 'severity_weight', 'effort_days', 'wave',
  'owner', 'impact_type', 'quantity_value', 'quantity_unit', 'urls_affected',
  'confidence', 'verify_by',
]

function toCsv(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [CSV_COLS.join(','), ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(','))].join('\n')
}

function toMarkdown(
  brand: Record<string, unknown>, audit: Record<string, unknown>, rows: Record<string, unknown>[],
): string {
  const out = [`# ${audit.title}`, '', `${brand.name}  ·  ${rows.length} findings`, '']
  for (const f of rows) {
    out.push(`## ${f.ref}  ${f.title}`, '')
    if (f.action) out.push(`**Fix.** ${f.action}`, '')
    const steps = (f.steps as string[]) ?? []
    if (steps.length) out.push(...steps.map((s) => `- ${s}`), '')
    out.push(
      `Owner ${f.owner ?? 'unassigned'}  ·  effort ${f.effort_days ?? '?'} days  ·  wave ${f.wave ?? '?'}  ·  status ${f.status}`,
      '',
    )
  }
  return out.join('\n')
}

/* -------------------------------------------------------------- the schema */
/** The field catalogue, served so an agent can discover the record rather
 *  than guess at it. Supply mode is the useful part: it says which fields a
 *  caller may set and which the system owns. */
export const schema = {
  get() {
    return {
      groups: FIELDS,
      supply_modes: {
        system: 'Assigned by the app. Not writable.',
        derived: 'Computed from other fields in logic mode. Writable in manual mode.',
        controlled: "Must come from the brand's registry.",
        imported: 'Expected to arrive from a crawl or tool, with provenance.',
        judged: 'A human call. Yours to set.',
      },
      note:
        'In an audit with mode=logic the database enforces the constraints listed ' +
        'under required_when, plus a status state machine. In mode=manual nothing ' +
        'is enforced and every field is writable.',
    }
  },
}

const FIELDS: Record<string, { field: string; mode: string; type: string; required_when?: string }[]> = {
  identity: [
    { field: 'ref', mode: 'system', type: 'text', required_when: 'always, generated if omitted' },
    { field: 'title', mode: 'judged', type: 'text', required_when: 'always' },
    { field: 'pillar', mode: 'controlled', type: 'text' },
    { field: 'raised', mode: 'system', type: 'date' },
  ],
  scope: [
    { field: 'urls_affected', mode: 'imported', type: 'integer' },
    { field: 'templates', mode: 'controlled', type: 'text[]' },
    { field: 'markets', mode: 'controlled', type: 'text[]' },
  ],
  evidence: [
    { field: 'measurements', mode: 'imported', type: 'jsonb[{check,result,taken}]' },
    { field: 'source', mode: 'controlled', type: 'text[]', required_when: 'must be a subset of audit.sources' },
    { field: 'collected_from', mode: 'derived', type: 'date' },
    { field: 'collected_to', mode: 'derived', type: 'date' },
    { field: 'confidence', mode: 'judged', type: 'enum high|medium|low' },
    { field: 'confidence_reason', mode: 'judged', type: 'text', required_when: 'confidence is not high' },
  ],
  impact: [
    { field: 'impact_type', mode: 'judged', type: 'enum' },
    { field: 'metric_at_risk', mode: 'controlled', type: 'text' },
    { field: 'quantity_value', mode: 'judged', type: 'numeric' },
    { field: 'quantity_unit', mode: 'controlled', type: 'text' },
    { field: 'impact_basis', mode: 'judged', type: 'text', required_when: 'quantity_value is set' },
    { field: 'time_horizon', mode: 'judged', type: 'enum' },
    { field: 'affects', mode: 'judged', type: 'enum[]' },
  ],
  remedy: [
    { field: 'action', mode: 'judged', type: 'text' },
    { field: 'steps', mode: 'judged', type: 'text[]' },
    { field: 'owner', mode: 'controlled', type: 'text' },
    { field: 'effort_days', mode: 'controlled', type: 'numeric, bucketed' },
    { field: 'wave', mode: 'derived', type: 'integer' },
    { field: 'depends_on', mode: 'judged', type: 'uuid[] of findings' },
    { field: 'external_blockers', mode: 'judged', type: 'text[]' },
  ],
  risk: [
    { field: 'blast_radius', mode: 'judged', type: 'smallint 1..3' },
    { field: 'failure_likelihood', mode: 'judged', type: 'smallint 1..3' },
    { field: 'reversibility', mode: 'judged', type: 'smallint 0..2' },
    { field: 'risk_factor', mode: 'system', type: 'numeric, computed' },
  ],
  priority: [
    { field: 'severity_weight', mode: 'judged', type: 'smallint 1..5' },
    { field: 'reach', mode: 'derived', type: 'numeric 0..1' },
    { field: 'confidence_factor', mode: 'derived', type: 'numeric 0..1' },
    { field: 'leverage', mode: 'derived', type: 'smallint 1..5' },
    { field: 'score', mode: 'system', type: 'numeric, computed' },
  ],
  lifecycle: [
    { field: 'status', mode: 'judged', type: 'enum, state machine in logic mode' },
    { field: 'verification_method', mode: 'judged', type: 'text' },
    { field: 'verify_by', mode: 'derived', type: 'date' },
    { field: 'verified_on', mode: 'judged', type: 'date', required_when: 'status is verified, and only then' },
    { field: 'closed_note', mode: 'judged', type: 'text', required_when: 'status is fixed, verified or accepted_risk' },
  ],
  after_delivery: [
    { field: 'exposure', mode: 'judged', type: 'text' },
    { field: 'decision', mode: 'judged', type: 'enum accepted|deferred|rejected' },
    { field: 'decided_at', mode: 'judged', type: 'timestamptz' },
    { field: 'decided_by', mode: 'judged', type: 'text' },
    { field: 'decision_note', mode: 'judged', type: 'text' },
    { field: 'acceptance_checks', mode: 'judged', type: 'jsonb, read by the verifier' },
    { field: 'last_check_at', mode: 'system', type: 'timestamptz, written by the verifier' },
    { field: 'last_check_result', mode: 'system', type: 'jsonb, written by the verifier' },
    { field: 'implemented_on', mode: 'judged', type: 'date' },
    { field: 'outcome_note', mode: 'judged', type: 'text' },
    { field: 'outcome_value', mode: 'judged', type: 'numeric' },
    { field: 'outcome_unit', mode: 'judged', type: 'text' },
    { field: 'outcome_measured_on', mode: 'judged', type: 'date' },
  ],
}

export { rpc }
