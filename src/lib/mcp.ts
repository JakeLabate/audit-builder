import { supabase } from './supabase'

/**
 * MCP connections.
 *
 * An MCP client signs in as a person through Supabase's OAuth server, so the
 * grant itself lives in Supabase. What Supabase does not know is which
 * workspace the client should act in, so that is kept here, one row per
 * person and client, and the API worker reads it on every call.
 */

export interface Workspace { id: string; name: string }

export interface Connection {
  clientId: string
  name: string
  logo: string | null
  grantedAt: string
  workspace: string | null
  lastUsed: string | null
}

export async function myWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase.from('orgs').select('id,name').order('name')
  if (error) throw error
  return (data ?? []) as Workspace[]
}

/** Record the workspace a client acts in. Called before the grant is approved. */
export async function saveConnection(
  userId: string, clientId: string, orgId: string, clientName: string,
): Promise<void> {
  const { error } = await supabase.from('mcp_connections').upsert(
    { user_id: userId, client_id: clientId, org_id: orgId, client_name: clientName },
    { onConflict: 'user_id,client_id' },
  )
  if (error) throw error
}

export async function listConnections(): Promise<Connection[]> {
  const [{ data: grants, error }, { data: rows }, ws] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase.from('mcp_connections').select('client_id, org_id, last_used_at'),
    myWorkspaces().catch(() => [] as Workspace[]),
  ])
  if (error) throw error
  const byClient = new Map((rows ?? []).map((r) => [r.client_id as string, r]))
  const wsName = new Map(ws.map((w) => [w.id, w.name]))
  return (grants ?? []).map((g) => {
    const r = byClient.get(g.client.id)
    return {
      clientId: g.client.id,
      name: g.client.name || 'Unnamed client',
      logo: g.client.logo_uri || null,
      grantedAt: g.granted_at,
      workspace: r ? wsName.get(r.org_id as string) ?? null : null,
      lastUsed: (r?.last_used_at as string | null) ?? null,
    }
  })
}

/** Revoke the grant in Supabase, so the client's tokens stop working, and
 *  forget its workspace. */
export async function disconnect(clientId: string): Promise<void> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  if (error) throw error
  await supabase.from('mcp_connections').delete().eq('client_id', clientId)
}
