/**
 * The MCP surface. Streamable HTTP, JSON-RPC 2.0, stateless: every request
 * carries the API key, so there is no session to keep and the worker stays
 * free to run anywhere.
 *
 * Tools are thin wrappers over the same handlers the REST routes use. The
 * only thing this file adds is the schema an agent needs to call them.
 */
import { ApiError, type Env } from './db'
import { audits, brands, examples, exports_, findings, schema, type Ctx } from './resources'

const PROTOCOL = '2025-06-18'

type Json = Record<string, unknown>
const str = (d: string) => ({ type: 'string', description: d })

interface Tool {
  name: string
  description: string
  inputSchema: Json
  run: (env: Env, ctx: Ctx, a: Json) => Promise<unknown>
}

const params = (props: Json, required: string[] = []) => ({
  type: 'object', properties: props, required,
})

/** A finding body, described once. Every writable field, nothing else. */
const FINDING_BODY: Json = {
  title: str('The finding stated as a claim, not a topic.'),
  pillar: str('Which area of the audit. Must be in the brand registry.'),
  urls_affected: { type: 'integer' },
  templates: { type: 'array', items: { type: 'string' } },
  markets: { type: 'array', items: { type: 'string' } },
  measurements: {
    type: 'array',
    description: 'Each check you ran: {check, result, taken}.',
    items: params({ check: str(''), result: str(''), taken: str('YYYY-MM-DD') }),
  },
  source: { type: 'array', items: { type: 'string' }, description: 'Must be a subset of the audit sources.' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  confidence_reason: str('Required when confidence is not high.'),
  impact_type: {
    type: 'string',
    enum: ['duplicate_content', 'crawl_waste', 'lost_visibility', 'broken_experience', 'compliance_exposure'],
  },
  metric_at_risk: str(''),
  quantity_value: { type: 'number' },
  quantity_unit: str(''),
  impact_basis: str('Where the quantity came from. Required if quantity_value is set.'),
  time_horizon: {
    type: 'string',
    enum: ['already_happening', 'next_crawl_cycle', 'next_release', 'latent'],
  },
  affects: { type: 'array', items: { type: 'string', enum: ['end_users', 'crawlers', 'internal_team'] } },
  action: str('The fix in one line, as an instruction to the owner.'),
  steps: { type: 'array', items: { type: 'string' } },
  owner: str('A team from the brand registry, never a person.'),
  effort_days: { type: 'number', description: 'Engineering days. 0.25, 0.5, 1, 2, 3, 5, 8 or 13.' },
  depends_on: { type: 'array', items: { type: 'string' }, description: 'Finding ids that must land first.' },
  external_blockers: { type: 'array', items: { type: 'string' } },
  blast_radius: { type: 'integer', minimum: 1, maximum: 3 },
  failure_likelihood: { type: 'integer', minimum: 1, maximum: 3 },
  reversibility: { type: 'integer', minimum: 0, maximum: 2 },
  severity_weight: { type: 'integer', minimum: 1, maximum: 5 },
  status: {
    type: 'string',
    enum: ['open', 'in_progress', 'fixed', 'verified', 'reopened', 'accepted_risk'],
  },
  verification_method: str('The exact check that proves it fixed.'),
  verified_on: str('Only with status verified.'),
  closed_note: str('Required when status is fixed, verified or accepted_risk.'),
}

const body = (a: Json, drop: string[]): Json => {
  const out: Json = {}
  for (const [k, v] of Object.entries(a)) if (!drop.includes(k)) out[k] = v
  return out
}

export const TOOLS: Tool[] = [
  {
    name: 'list_brands',
    description: 'Every brand in the workspace.',
    inputSchema: params({}),
    run: (env, ctx) => brands.list(env, ctx),
  },
  {
    name: 'create_brand',
    description: 'Add a brand.',
    inputSchema: params({ name: str(''), domain: str(''), notes: str('') }, ['name']),
    run: (env, ctx, a) => brands.create(env, ctx, a),
  },
  {
    name: 'list_audits',
    description: 'Audits, newest first. Filter by brand, status or mode.',
    inputSchema: params({
      brand_id: str(''),
      status: { type: 'string', enum: ['draft', 'in_review', 'delivered', 'archived'] },
      mode: { type: 'string', enum: ['manual', 'logic'] },
      limit: { type: 'integer' },
    }),
    run: (env, ctx, a) => audits.list(env, ctx, qs(a)),
  },
  {
    name: 'get_audit',
    description: 'One audit, including its declared sources, scope note and gaps.',
    inputSchema: params({ audit_id: str('') }, ['audit_id']),
    run: (env, ctx, a) => audits.get(env, ctx, String(a.audit_id)),
  },
  {
    name: 'create_audit',
    description:
      'Start an audit. mode=logic makes the database generate, derive and ' +
      'constrain the fields that do not need a human. mode=manual enforces nothing.',
    inputSchema: params({
      brand_id: str(''),
      title: str(''),
      mode: { type: 'string', enum: ['manual', 'logic'] },
      scope_note: str(''),
      sources: {
        type: 'array',
        description: 'Tools and windows this audit is allowed to cite: {tool, window, confidence}.',
        items: params({ tool: str(''), window: str(''), confidence: str('') }),
      },
    }, ['brand_id', 'title']),
    run: (env, ctx, a) => audits.create(env, ctx, a),
  },
  {
    name: 'update_audit',
    description: 'Change an audit. Moving status to delivered freezes every finding reference.',
    inputSchema: params({ audit_id: str(''), patch: { type: 'object' } }, ['audit_id', 'patch']),
    run: (env, ctx, a) => audits.update(env, ctx, String(a.audit_id), a.patch as Json),
  },
  {
    name: 'list_findings',
    description: 'Findings in an audit, with their exhibits and computed score.',
    inputSchema: params({
      audit_id: str(''),
      status: str(''), pillar: str(''), owner: str(''),
      impact_type: str(''), wave: { type: 'integer' },
      q: str('Substring match on the title.'),
      limit: { type: 'integer' },
    }, ['audit_id']),
    run: (env, ctx, a) => findings.list(env, ctx, qs(a)),
  },
  {
    name: 'get_finding',
    description: 'One finding in full, with exhibits.',
    inputSchema: params({ finding_id: str('') }, ['finding_id']),
    run: (env, ctx, a) => findings.get(env, ctx, String(a.finding_id)),
  },
  {
    name: 'create_finding',
    description:
      'Add a finding. The reference is generated from the pillar unless you pass one. ' +
      'In a logic audit the database refuses anything internally inconsistent and says why.',
    inputSchema: params({ audit_id: str(''), ...FINDING_BODY }, ['audit_id', 'title']),
    run: (env, ctx, a) => findings.create(env, ctx, a),
  },
  {
    name: 'update_finding',
    description: 'Change a finding. Same rules as creating one.',
    inputSchema: params({ finding_id: str(''), ...FINDING_BODY }, ['finding_id']),
    run: (env, ctx, a) => findings.update(env, ctx, String(a.finding_id), body(a, ['finding_id'])),
  },
  {
    name: 'delete_finding',
    description: 'Remove a finding and its exhibits.',
    inputSchema: params({ finding_id: str('') }, ['finding_id']),
    run: (env, ctx, a) => findings.remove(env, ctx, String(a.finding_id)),
  },
  {
    name: 'add_exhibit',
    description: 'Attach evidence to a finding: a page element, markup, a response or a SERP.',
    inputSchema: params({
      finding_id: str(''),
      kind: { type: 'string', enum: ['page_element', 'markup', 'response', 'serp'] },
      caption: str('What this proves, in your words.'),
      url: str(''), selector: str(''), extract: str(''), request: str(''),
      query: str(''), surface: str(''), captured: str('YYYY-MM-DD'),
      redacted: { type: 'boolean' },
    }, ['finding_id', 'kind']),
    run: (env, ctx, a) => examples.create(env, ctx, a),
  },
  {
    name: 'get_roadmap',
    description: 'The audit grouped into waves, with effort totalled per wave and overall.',
    inputSchema: params({ audit_id: str('') }, ['audit_id']),
    run: (env, ctx, a) => audits.roadmap(env, ctx, String(a.audit_id)),
  },
  {
    name: 'export_audit',
    description: 'The whole audit as json, csv or markdown.',
    inputSchema: params({
      audit_id: str(''),
      format: { type: 'string', enum: ['json', 'csv', 'markdown'] },
    }, ['audit_id']),
    run: (env, ctx, a) => exports_.audit(env, ctx, String(a.audit_id), String(a.format ?? 'json')),
  },
  {
    name: 'get_field_schema',
    description:
      'The finding record: every field, its type, and who supplies it. Read this ' +
      'before writing findings, so you set what is yours to set and leave the rest.',
    inputSchema: params({}),
    run: async () => schema.get(),
  },
]

function qs(a: Json): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(a)) if (v !== undefined && v !== null) p.set(k, String(v))
  return p
}

/* ------------------------------------------------------------- transport */

const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: unknown, code: number, message: string) =>
  ({ jsonrpc: '2.0', id, error: { code, message } })

export async function handleMcp(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  if (req.method === 'GET') {
    // No server-initiated messages, so there is nothing to stream.
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
  }
  let msg: Json
  try {
    msg = (await req.json()) as Json
  } catch {
    return json(fail(null, -32700, 'Parse error'))
  }

  const { method, id } = msg as { method?: string; id?: unknown }
  const p = (msg.params ?? {}) as Json

  // Notifications carry no id and expect no body.
  if (id === undefined && typeof method === 'string' && method.startsWith('notifications/')) {
    return new Response(null, { status: 202 })
  }

  switch (method) {
    case 'initialize':
      return json(ok(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'auditbuilder', version: '1.0.0' },
        instructions:
          'AuditBuilder holds SEO audit findings as one fixed record. Call ' +
          'get_field_schema first: it says which fields you may set and which the ' +
          'system owns. Audits in logic mode enforce their rules in the database, ' +
          'so a refusal explains itself and is worth reading rather than retrying.',
      }))

    case 'ping':
      return json(ok(id, {}))

    case 'tools/list':
      return json(ok(id, {
        tools: TOOLS.map((t) => ({
          name: t.name, description: t.description, inputSchema: t.inputSchema,
        })),
      }))

    case 'tools/call': {
      const name = String(p.name ?? '')
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return json(fail(id, -32602, `No tool named "${name}".`))
      try {
        const out = await tool.run(env, ctx, (p.arguments ?? {}) as Json)
        return json(ok(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out && typeof out === 'object' ? out : { value: out },
        }))
      } catch (e) {
        // A tool failure is a result, not a protocol error: the agent should
        // read the message and adjust rather than treat the call as broken.
        const m = e instanceof ApiError ? e.message : (e as Error).message
        return json(ok(id, { content: [{ type: 'text', text: m }], isError: true }))
      }
    }

    default:
      return json(fail(id, -32601, `Unknown method "${method}".`))
  }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status, headers: { 'Content-Type': 'application/json' },
  })
