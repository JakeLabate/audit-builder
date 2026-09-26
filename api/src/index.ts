/**
 * AuditBuilder API.
 *
 *   /v1/*   a REST surface over brands, audits, findings and exhibits
 *   /mcp    the same handlers exposed as MCP tools
 *
 * One auth path for both: a bearer key, hashed and looked up, resolving to an
 * org and a scope list. The two surfaces share every handler, so they cannot
 * drift apart.
 */
import { ApiError, rpc, type Env } from './db'
import { audits, brands, examples, exports_, findings, schema, type Ctx } from './resources'
import { handleMcp, TOOLS as MCP_TOOLS } from './mcp'
import { handleRender } from './render'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,Mcp-Session-Id,MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (path === '/' || path === '/v1') return json(index(url.origin))
    if (path === '/health') return json({ ok: true })

    // The app in a browser has a Supabase session, not an API key, so this one
    // route authenticates itself and never reaches the key gate below.
    if (path === '/render') {
      try {
        const res = await handleRender(req, env as never)
        for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v)
        return res
      } catch (e) {
        if (e instanceof ApiError) return json({ error: e.message }, e.status)
        return json({ error: (e as Error).message }, 500)
      }
    }

    try {
      const ctx = await authenticate(req, env)
      if (path === '/mcp') {
        const res = await handleMcp(req, env, ctx)
        for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v)
        return res
      }
      return json(await route(req, env, ctx, path, url.searchParams))
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status)
      return json({ error: (e as Error).message }, 500)
    }
  },
}

/* ---------------------------------------------------------------- auth */

async function authenticate(req: Request, env: Env): Promise<Ctx> {
  const raw = req.headers.get('Authorization') ?? ''
  const key = raw.replace(/^Bearer\s+/i, '').trim()
  if (!key) throw new ApiError(401, 'Send your key as: Authorization: Bearer ab_live_...')

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const rows = (await rpc(env, 'api_key_resolve', { p_hash: hash })) as {
    key_id: string; org_id: string; scopes: string[]
  }[]
  const row = rows?.[0]
  if (!row) throw new ApiError(401, 'That key is not valid, or it has been revoked.')
  return { org: row.org_id, scopes: row.scopes ?? [], keyId: row.key_id }
}

/* --------------------------------------------------------------- routes */

async function route(
  req: Request, env: Env, ctx: Ctx, path: string, q: URLSearchParams,
): Promise<unknown> {
  const seg = path.split('/').filter(Boolean)
  if (seg[0] !== 'v1') throw new ApiError(404, `No route for ${path}.`)
  const [, kind, id, sub] = seg
  const m = req.method
  const read = async (): Promise<Record<string, unknown>> => {
    if (m === 'GET' || m === 'DELETE') return {}
    try {
      return (await req.json()) as Record<string, unknown>
    } catch {
      throw new ApiError(400, 'The body has to be JSON.')
    }
  }

  switch (kind) {
    case 'schema':
      return schema.get()

    case 'brands':
      if (!id) return m === 'POST' ? brands.create(env, ctx, await read()) : brands.list(env, ctx)
      if (m === 'GET') return brands.get(env, ctx, id)
      if (m === 'PATCH') return brands.update(env, ctx, id, await read())
      if (m === 'DELETE') return brands.remove(env, ctx, id)
      break

    case 'audits':
      if (!id) return m === 'POST' ? audits.create(env, ctx, await read()) : audits.list(env, ctx, q)
      if (sub === 'findings' && m === 'GET') {
        q.set('audit_id', id)
        return findings.list(env, ctx, q)
      }
      if (sub === 'roadmap' && m === 'GET') return audits.roadmap(env, ctx, id)
      if (sub === 'export' && m === 'GET') {
        return exports_.audit(env, ctx, id, q.get('format') ?? 'json')
      }
      if (m === 'GET') return audits.get(env, ctx, id)
      if (m === 'PATCH') return audits.update(env, ctx, id, await read())
      if (m === 'DELETE') return audits.remove(env, ctx, id)
      break

    case 'findings':
      if (!id) return m === 'POST' ? findings.create(env, ctx, await read()) : findings.list(env, ctx, q)
      if (sub === 'examples' && m === 'POST') {
        return examples.create(env, ctx, { ...(await read()), finding_id: id })
      }
      if (m === 'GET') return findings.get(env, ctx, id)
      if (m === 'PATCH') return findings.update(env, ctx, id, await read())
      if (m === 'DELETE') return findings.remove(env, ctx, id)
      break

    case 'examples':
      if (id && m === 'PATCH') return examples.update(env, ctx, id, await read())
      if (id && m === 'DELETE') return examples.remove(env, ctx, id)
      break
  }
  throw new ApiError(404, `No route for ${m} ${path}.`)
}

/* ------------------------------------------------------------ discovery */

const index = (origin: string) => ({
  name: 'AuditBuilder API',
  auth: 'Authorization: Bearer ab_live_...',
  mcp: `${origin}/mcp`,
  render: `${origin}/render`,
  scopes: ['read', 'write'],
  // Listed here, unauthenticated, so the docs page in the app is generated
  // from the worker rather than written alongside it and left to drift.
  tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  routes: [
    'GET    /v1/schema',
    'GET    /v1/brands',
    'POST   /v1/brands',
    'GET    /v1/brands/:id',
    'PATCH  /v1/brands/:id',
    'DELETE /v1/brands/:id',
    'GET    /v1/audits?brand_id=&status=&mode=&limit=',
    'POST   /v1/audits',
    'GET    /v1/audits/:id',
    'PATCH  /v1/audits/:id',
    'DELETE /v1/audits/:id',
    'GET    /v1/audits/:id/findings',
    'GET    /v1/audits/:id/roadmap',
    'GET    /v1/audits/:id/export?format=json|csv|markdown',
    'GET    /v1/findings?audit_id=&status=&pillar=&owner=&wave=&q=',
    'POST   /v1/findings',
    'GET    /v1/findings/:id',
    'PATCH  /v1/findings/:id',
    'DELETE /v1/findings/:id',
    'POST   /v1/findings/:id/examples',
    'PATCH  /v1/examples/:id',
    'DELETE /v1/examples/:id',
  ],
})

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
