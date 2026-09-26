import { supabase } from './supabase'
import type { Audit, Brand } from './types'

/**
 * The export ledger.
 *
 * An export used to leave nothing behind: the register URL sat in a twenty
 * second toast and the document went to a print dialog that hands nothing
 * back. One row per export fixes that, and the row is what the Deliverables
 * panel reads, so what a client received stays answerable later.
 */

export interface ExportRow {
  id: string
  org_id: string
  audit_id: string
  created_at: string
  created_by: string | null
  sheet_url: string | null
  pdf_path: string | null
  pdf_url: string | null
  kind: string | null
  title: string | null
  sections: unknown
  columns: unknown
  finding_count: number | null
  note: string | null
}

const RENDER_URL = 'https://audit-api.jake-a-labate.workers.dev/render'

export async function listExports(auditId: string): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from('exports').select('*')
    .eq('audit_id', auditId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []) as ExportRow[]
}

export async function deleteExport(id: string): Promise<void> {
  const { error } = await supabase.from('exports').delete().eq('id', id)
  if (error) throw error
}

/** Headless Chrome prints the document and hands back a stored, linkable PDF. */
export async function renderPdf(
  auditId: string, html: string, filename: string,
): Promise<{ path: string; url: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session expired. Sign in again and re-run the export.')

  const res = await fetch(RENDER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audit_id: auditId, html, filename }),
  })
  const body = (await res.json().catch(() => ({}))) as { url?: string; path?: string; error?: string }
  if (!res.ok || !body.url) throw new Error(body.error ?? `The renderer returned ${res.status}.`)
  return { path: body.path!, url: body.url }
}

export async function recordExport(row: {
  audit: Audit
  brand: Brand
  sheet_url: string | null
  pdf_path: string | null
  pdf_url: string | null
  finding_count: number
  note?: string | null
}): Promise<ExportRow> {
  const { data: who } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('exports').insert({
    org_id: row.audit.org_id,
    audit_id: row.audit.id,
    created_by: who.user?.email ?? null,
    sheet_url: row.sheet_url,
    pdf_path: row.pdf_path,
    pdf_url: row.pdf_url,
    kind: row.audit.kind,
    title: `${row.brand.name}, ${row.audit.title}`,
    sections: row.audit.sections ?? [],
    columns: (row.audit as unknown as { sheet_columns?: unknown }).sheet_columns ?? [],
    finding_count: row.finding_count,
    note: row.note ?? null,
  }).select().single()
  if (error) throw error
  return data as ExportRow
}

/** A file name a client can recognise in a downloads folder. */
export function exportFilename(brand: Brand, audit: Audit): string {
  const when = audit.delivered_on ?? new Date().toISOString().slice(0, 10)
  return `${brand.name}-${audit.title}-${when}`.replace(/\s+/g, '-')
}
