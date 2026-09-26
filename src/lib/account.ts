import { supabase } from './supabase'

export interface DeletionRow {
  workspace: string
  role: string
  brands: number
  audits: number
  findings: number
  others: number
  will_be_deleted: boolean
}

/** What leaving actually destroys, before it is destroyed. */
export async function deletionPreview(): Promise<DeletionRow[]> {
  const { data, error } = await supabase.rpc('account_deletion_preview')
  if (error) throw error
  return (data ?? []) as DeletionRow[]
}

export const DELETE_PHRASE = 'delete my account'

export async function deleteAccount(confirm: string): Promise<void> {
  const { error } = await supabase.rpc('account_delete', { p_confirm: confirm })
  if (error) throw error
  await supabase.auth.signOut()
}
