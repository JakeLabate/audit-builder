import { supabase } from './supabase'
import type { Audit, AuditMode } from './types'
import { sectionsWithCoverage, type AuditCheck, type AuditTemplate, type CheckSpec } from './checks'

/** Reads and writes for checklists. The shapes and the library are in checks.ts. */

const CHECK_COLS = 'id, org_id, audit_id, key, path, title, tool, pass_criteria, status, note, finding_id, position, checked_at'
const TEMPLATE_COLS = 'id, org_id, name, description, checks, created_at, updated_at'

export async function listChecks(auditId: string): Promise<AuditCheck[]> {
  const { data, error } = await supabase
    .from('audit_checks').select(CHECK_COLS).eq('audit_id', auditId).order('position')
  if (error) throw error
  return (data ?? []) as AuditCheck[]
}

/** Copies specs into an audit. The audit owns its copy from here on. */
export async function addChecks(
  orgId: string, auditId: string, specs: CheckSpec[], startAt = 0,
): Promise<AuditCheck[]> {
  if (specs.length === 0) return []
  const rows = specs.map((s, i) => ({
    org_id: orgId, audit_id: auditId, key: s.key, path: s.path, title: s.title,
    tool: s.tool, pass_criteria: s.pass, position: startAt + i,
  }))
  const { data, error } = await supabase.from('audit_checks').insert(rows).select(CHECK_COLS)
  if (error) throw error
  return ((data ?? []) as AuditCheck[]).sort((a, b) => a.position - b.position)
}

export async function updateCheck(
  id: string, patch: Partial<Pick<AuditCheck, 'status' | 'note' | 'finding_id'>>,
): Promise<void> {
  const { error } = await supabase.from('audit_checks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCheck(id: string): Promise<void> {
  const { error } = await supabase.from('audit_checks').delete().eq('id', id)
  if (error) throw error
}

export async function listTemplates(): Promise<AuditTemplate[]> {
  const { data, error } = await supabase.from('audit_templates').select(TEMPLATE_COLS).order('name')
  if (error) throw error
  return (data ?? []) as AuditTemplate[]
}

export async function createTemplate(orgId: string, name: string, checks: CheckSpec[]): Promise<AuditTemplate> {
  const { data, error } = await supabase
    .from('audit_templates').insert({ org_id: orgId, name: name.trim(), checks }).select(TEMPLATE_COLS).single()
  if (error) throw nicer(error)
  return data as AuditTemplate
}

export async function updateTemplate(
  id: string, patch: Partial<Pick<AuditTemplate, 'name' | 'checks'>>,
): Promise<void> {
  const { error } = await supabase.from('audit_templates').update(patch).eq('id', id)
  if (error) throw nicer(error)
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('audit_templates').delete().eq('id', id)
  if (error) throw error
}

/** A unique violation here only ever means the name is taken. */
function nicer(e: { code?: string; message: string }): Error {
  return e.code === '23505' ? new Error('You already have a template with that name.') : new Error(e.message)
}

/**
 * A new audit with its checklist copied in. Two writes, so if the second
 * fails the audit is removed again: an audit that claims a checklist and has
 * no checks in it would report full coverage of nothing.
 */
export async function createAuditWithChecks(
  orgId: string, brandId: string, title: string, mode: AuditMode,
  checklistName: string | null, specs: CheckSpec[],
): Promise<Audit> {
  const { data, error } = await supabase
    .from('audits')
    .insert({
      org_id: orgId, brand_id: brandId, title, mode,
      checklist_name: checklistName, sections: sectionsWithCoverage(),
    })
    .select()
    .single()
  if (error) throw error
  try {
    await addChecks(orgId, data.id, specs)
  } catch (e) {
    await supabase.from('audits').delete().eq('id', data.id)
    throw e
  }
  return data as Audit
}
