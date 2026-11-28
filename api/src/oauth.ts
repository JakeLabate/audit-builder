/**
 * MCP sign in.
 *
 * The MCP endpoint does not take a key. An MCP client signs the person in
 * through Supabase's OAuth 2.1 server, with the same account they use in the
 * app, and sends the access token it gets back. This file is the resource
 * server half of that:
 *
 *   - it publishes protected resource metadata (RFC 9728), which tells a
 *     client where to sign in;
 *   - it answers a request without a valid token with a 401 that points at
 *     that metadata, which is what makes a client start the sign in;
 *   - it turns a valid token into a workspace and a permission level.
 *
 * Supabase owns the login, the consent record, client registration and token
 * issue. Nothing secret is minted or stored here.
 */
import { ApiError, type Env } from './db'
import type { Ctx } from './resources'

/** Where the metadata lives, for a resource at `${origin}/mcp`. */
export const resourceMetadataUrl = (origin: string) =>
  `${origin}/.well-known/oauth-protected-resource/mcp`

export function protectedResource(origin: string, env: Env) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [`${env.SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
    resource_name: 'AuditBuilder',
    resource_documentation: 'https://auditbuilder.jakelabate.com/mcp',
  }
}

/** A 401 that tells an MCP client how to get a token. */
export class SignInRequired extends ApiError {
  constructor(message: string, readonly invalid = false) {
    super(401, message)
  }
  header(origin: string): string {
    const bits = [`resource_metadata="${resourceMetadataUrl(origin)}"`]
    if (this.invalid) bits.unshift('error="invalid_token"')
    return `Bearer ${bits.join(', ')}`
  }
}

interface Claims { sub?: string; client_id?: string; role?: string }

function claimsOf(token: string): Claims {
  try {
    const part = token.split('.')[1] ?? ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
    return JSON.parse(atob(b64)) as Claims
  } catch {
    return {}
  }
}

const service = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
})

async function rows<T>(env: Env, path: string): Promise<T[]> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: service(env) })
  if (!res.ok) throw new ApiError(500, `Could not read ${path.split('?')[0]}.`)
  return (await res.json()) as T[]
}

/**
 * Resolve a request to a person, a workspace and what they may do there.
 * `background` lets the caller stamp last use without delaying the answer.
 */
export async function authenticateMcp(
  req: Request, env: Env, background: (p: Promise<unknown>) => void,
): Promise<Ctx> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new SignInRequired('Sign in to AuditBuilder to use this server.')

  if (token.startsWith('ab_live_')) {
    throw new SignInRequired(
      'The MCP server signs in with your AuditBuilder account now, not an API key. ' +
      'Remove the Authorization header from your client config and connect again: ' +
      'your client will open a sign in page. API keys still work for the REST API.',
      true,
    )
  }

  // Supabase checks the signature, the expiry and that the session is still
  // live, so a revoked connection stops working here rather than at expiry.
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  })
  if (!who.ok) throw new SignInRequired('Your sign in has expired. Connect again.', true)
  const user = (await who.json()) as { id?: string }

  // Verified above, so the payload can be read without checking it twice.
  const c = claimsOf(token)
  if (!user.id || c.sub !== user.id) throw new SignInRequired('That token is not valid.', true)
  if (!c.client_id) {
    throw new SignInRequired(
      'That is an app session, not an MCP connection. Connect from your MCP client instead.',
      true,
    )
  }

  const member = await rows<{ org_id: string; role: string }>(
    env, `memberships?user_id=eq.${user.id}&select=org_id,role`,
  )
  if (member.length === 0) throw new ApiError(403, 'You are not a member of any workspace.')

  const chosen = await rows<{ org_id: string }>(
    env,
    `mcp_connections?user_id=eq.${user.id}&client_id=eq.${encodeURIComponent(c.client_id)}&select=org_id`,
  )
  const pick = chosen[0]?.org_id
  const m = pick
    ? member.find((x) => x.org_id === pick)
    : member.length === 1 ? member[0] : undefined
  if (!m) {
    throw new ApiError(403, pick
      ? 'You are no longer a member of the workspace this connection was made for. Connect again and pick a workspace.'
      : 'You belong to more than one workspace. Connect again and pick the one this client should use.')
  }

  if (chosen.length > 0) {
    background(fetch(
      `${env.SUPABASE_URL}/rest/v1/mcp_connections?user_id=eq.${user.id}&client_id=eq.${encodeURIComponent(c.client_id)}`,
      { method: 'PATCH', headers: service(env), body: JSON.stringify({ last_used_at: new Date().toISOString() }) },
    ))
  }

  return {
    org: m.org_id,
    scopes: m.role === 'viewer' ? ['read'] : ['read', 'write'],
    keyId: '',
    userId: user.id,
    clientId: c.client_id,
  }
}
