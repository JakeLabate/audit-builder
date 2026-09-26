import { supabase } from './supabase'

export interface ApiKeyRow {
  id: string
  org_id: string
  name: string
  prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

/** The plaintext, returned exactly once at creation and never again. */
export interface MintedKey extends ApiKeyRow { key: string }

export async function listKeys(orgId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from('api_keys_public').select('*')
    .eq('org_id', orgId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ApiKeyRow[]
}

export async function createKey(
  orgId: string, name: string, scopes: string[],
): Promise<MintedKey> {
  const { data, error } = await supabase.rpc('api_key_create', {
    p_org: orgId, p_name: name, p_scopes: scopes,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.key) throw new Error('The key was created but not returned. Revoke it and try again.')
  return row as MintedKey
}

export async function revokeKey(id: string): Promise<void> {
  const { error } = await supabase.rpc('api_key_revoke', { p_id: id })
  if (error) throw error
}
