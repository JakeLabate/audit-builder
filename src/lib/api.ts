import { supabase } from './supabase'
import type { Audit, Brand, Example, Finding, FindingFull, Org } from './types'
import { band, riskFactor, score } from './score'

/** RLS does the filtering, so no query here passes an org id as a filter. */

export async function currentOrg(): Promise<Org | null> {
  const { data, error } = await supabase.from('orgs').select('id,name,slug').limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from('brands').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function createBrand(orgId: string, name: string, domain: string): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .insert({ org_id: orgId, name, domain: domain || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBrand(id: string, patch: Partial<Brand>): Promise<void> {
  const { error } = await supabase.from('brands').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await supabase.from('brands').delete().eq('id', id)
  if (error) throw error
}

export async function listAudits(brandId?: string): Promise<Audit[]> {
  let q = supabase.from('audits').select('*').order('created_at', { ascending: false })
  if (brandId) q = q.eq('brand_id', brandId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getAudit(id: string): Promise<Audit | null> {
  const { data, error } = await supabase.from('audits').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createAudit(orgId: string, brandId: string, title: string): Promise<Audit> {
  const { data, error } = await supabase
    .from('audits')
    .insert({ org_id: orgId, brand_id: brandId, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAudit(id: string, patch: Partial<Audit>): Promise<void> {
  const { error } = await supabase.from('audits').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAudit(id: string): Promise<void> {
  const { error } = await supabase.from('audits').delete().eq('id', id)
  if (error) throw error
}

/** Findings come back with their exhibits and the score computed client side. */
export async function listFindings(auditId: string): Promise<FindingFull[]> {
  const { data, error } = await supabase
    .from('findings')
    .select('*, examples(*)')
    .eq('audit_id', auditId)
    .order('position')
  if (error) throw error
  return (data ?? []).map(decorate)
}

export function decorate(row: Finding & { examples?: Example[] }): FindingFull {
  const s = score(row)
  return {
    ...row,
    examples: (row.examples ?? []).sort((a, b) => a.position - b.position),
    score: s,
    band: band(s),
    risk_factor: riskFactor(row),
  }
}

export async function nextRef(auditId: string, pillarPrefix: string): Promise<string> {
  const { data, error } = await supabase.from('findings').select('ref').eq('audit_id', auditId)
  if (error) throw error
  const used = new Set((data ?? []).map((r) => r.ref))
  let n = 1
  while (used.has(`${pillarPrefix}-${String(n).padStart(3, '0')}`)) n++
  return `${pillarPrefix}-${String(n).padStart(3, '0')}`
}

export async function createFinding(
  orgId: string,
  auditId: string,
  ref: string,
  title: string,
  position: number,
): Promise<FindingFull> {
  const { data, error } = await supabase
    .from('findings')
    .insert({ org_id: orgId, audit_id: auditId, ref, title, position })
    .select('*, examples(*)')
    .single()
  if (error) throw error
  return decorate(data)
}

export async function updateFinding(id: string, patch: Partial<Finding>): Promise<void> {
  const { error } = await supabase.from('findings').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteFinding(id: string): Promise<void> {
  const { error } = await supabase.from('findings').delete().eq('id', id)
  if (error) throw error
}

export async function createExample(
  orgId: string,
  findingId: string,
  kind: Example['kind'],
  position: number,
): Promise<Example> {
  const { data, error } = await supabase
    .from('examples')
    .insert({ org_id: orgId, finding_id: findingId, kind, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExample(id: string, patch: Partial<Example>): Promise<void> {
  const { error } = await supabase.from('examples').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteExample(id: string): Promise<void> {
  const { error } = await supabase.from('examples').delete().eq('id', id)
  if (error) throw error
}

/** Evidence images live in a private bucket; reads go through signed URLs. */
export async function uploadEvidence(orgId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('evidence').upload(path, file, { upsert: false })
  if (error) throw error
  return path
}

export async function evidenceUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
