import { supabase } from './supabase'

/**
 * Workspace membership.
 *
 * There is no mail server behind this, so an invitation produces a link you
 * send yourself. That is a smaller feature than emailing it and a more honest
 * one: you can see exactly what you are handing over, and there is no silent
 * failure in somebody's spam folder.
 */

export interface Member {
  user_id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: 'owner' | 'editor' | 'viewer'
  joined_at: string
  is_you: boolean
}

export interface Invite {
  id: string
  org_id: string
  email: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export const ROLE_MEANS: Record<string, string> = {
  owner: 'Everything, including managing people and deleting the workspace.',
  editor: 'Write audits and findings, run exports, invite others.',
  viewer: 'Read everything and export. Cannot change a record.',
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('workspace_members', { p_org: orgId })
  if (error) throw error
  return (data ?? []) as Member[]
}

export async function listInvites(orgId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites').select('*')
    .eq('org_id', orgId).is('accepted_at', null).is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invite[]
}

/** The token comes back once. The row only ever holds its hash. */
export async function createInvite(
  orgId: string, email: string, role: string,
): Promise<{ id: string; email: string; role: string; expires_at: string; link: string }> {
  const { data, error } = await supabase.rpc('invite_create', {
    p_org: orgId, p_email: email, p_role: role,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as
    { id: string; email: string; role: string; expires_at: string; token: string }
  if (!row?.token) throw new Error('The invitation was made but no link came back. Withdraw it and try again.')
  return { ...row, link: `${location.origin}/join/${row.token}` }
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('invite_revoke', { p_id: id })
  if (error) throw error
}

export async function acceptInvite(token: string): Promise<{ org_id: string; org_name: string; role: string }> {
  const { data, error } = await supabase.rpc('invite_accept', { p_token: token })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { org_id: string; org_name: string; role: string }
  if (!row?.org_id) throw new Error('That invitation could not be accepted.')
  return row
}

export async function setRole(orgId: string, userId: string, role: string): Promise<void> {
  const { error } = await supabase.rpc('member_set_role', { p_org: orgId, p_user: userId, p_role: role })
  if (error) throw error
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('member_remove', { p_org: orgId, p_user: userId })
  if (error) throw error
}
