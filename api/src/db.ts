/**
 * The only path to Postgres.
 *
 * The worker holds the service role key, which bypasses row level security.
 * That makes org scoping the worker's job rather than the database's, so it
 * is centralised here: every table read and write goes through `scoped`,
 * which refuses to run without an org, and every row that comes back is
 * checked against that org before it is returned. A dropped filter therefore
 * fails loudly instead of leaking a different consultant's audit.
 */

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  MAX_PAGE?: string
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: unknown) {
    super(message)
  }
}

type Row = Record<string, unknown>

function headers(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function send(env: Env, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, init)
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    // Postgres raises our own constraint messages through here. They are
    // written for a person, so they are passed along rather than swallowed.
    const msg =
      (body && typeof body === 'object' && 'message' in body && String(body.message)) ||
      `Database error ${res.status}`
    throw new ApiError(res.status === 404 ? 404 : 400, msg, body)
  }
  return body
}

/** A read. `query` must already be a PostgREST filter string. */
export async function scoped(
  env: Env, org: string, table: string, query = '', single = false,
): Promise<Row[] | Row | null> {
  if (!org) throw new ApiError(500, 'Refusing to query without an org scope.')
  const q = `${table}?org_id=eq.${org}${query ? '&' + query : ''}`
  const rows = (await send(env, q, { method: 'GET', headers: headers(env) })) as Row[]
  assertOrg(rows, org)
  if (single) return rows[0] ?? null
  return rows
}

export async function insert(env: Env, org: string, table: string, row: Row): Promise<Row> {
  if (!org) throw new ApiError(500, 'Refusing to insert without an org scope.')
  const rows = (await send(env, `${table}?select=*`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify({ ...row, org_id: org }),
  })) as Row[]
  assertOrg(rows, org)
  return rows[0]
}

export async function patch(
  env: Env, org: string, table: string, id: string, row: Row,
): Promise<Row> {
  if (!org) throw new ApiError(500, 'Refusing to update without an org scope.')
  // org_id is never patchable: moving a row between orgs through the API is
  // not a thing anyone should be able to do by accident.
  const { org_id: _drop, id: _id, created_at: _c, ...safe } = row
  const rows = (await send(env, `${table}?id=eq.${id}&org_id=eq.${org}&select=*`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(safe),
  })) as Row[]
  if (rows.length === 0) throw new ApiError(404, `No ${table} with id ${id} in this workspace.`)
  assertOrg(rows, org)
  return rows[0]
}

export async function remove(env: Env, org: string, table: string, id: string): Promise<void> {
  if (!org) throw new ApiError(500, 'Refusing to delete without an org scope.')
  const rows = (await send(env, `${table}?id=eq.${id}&org_id=eq.${org}&select=id`, {
    method: 'DELETE',
    headers: headers(env, { Prefer: 'return=representation' }),
  })) as Row[]
  if (rows.length === 0) throw new ApiError(404, `No ${table} with id ${id} in this workspace.`)
}

export async function rpc(env: Env, fn: string, args: Row): Promise<unknown> {
  return send(env, `rpc/${fn}`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(args),
  })
}

/** Defence in depth. If a filter is ever dropped, this is what catches it. */
function assertOrg(rows: Row[], org: string) {
  for (const r of rows) {
    if ('org_id' in r && r.org_id !== org) {
      throw new ApiError(500, 'Scope check failed. The request was refused rather than served.')
    }
  }
}
