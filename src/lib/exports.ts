import { supabase } from './supabase'
import { RENDER_URL } from './apibase'
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
  /** Deprecated: links are signed from pdf_path when one is needed. */
  pdf_url: string | null
  kind: string | null
  title: string | null
  sections: unknown
  columns: unknown
  finding_count: number | null
  note: string | null
}


export async function listExports(auditId: string): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from('exports').select('*')
    .eq('audit_id', auditId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []) as ExportRow[]
}

export async function deleteExport(id: string, pdfPath?: string | null): Promise<void> {
  // Dropping the row used to leave the PDF in storage for ever, unreferenced
  // and unreachable, which is the worst of both: you pay for it and cannot
  // find it. The file goes with the record.
  if (pdfPath) {
    const { error } = await supabase.storage.from('audit-docs').remove([pdfPath])
    if (error) throw new Error(`The document could not be deleted, so the record was kept. ${error.message}`)
  }
  const { error } = await supabase.from('exports').delete().eq('id', id)
  if (error) throw error
}

/**
 * A link to a stored document, signed for a limited time.
 *
 * The bucket used to be public, which made a permanent link and also made
 * every client's audit readable by anyone who ever saw the URL, with no way
 * to withdraw it. A workspace holding somebody else's client data cannot
 * carry that default, so the file is private and a link is minted per share.
 */
export const LINK_DAYS = 30

export async function documentLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('audit-docs').createSignedUrl(path, LINK_DAYS * 24 * 60 * 60)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('No link came back for that document.')
  return data.signedUrl
}

/** Headless Chrome prints the document and hands back a stored, linkable PDF. */
export async function renderPdf(
  auditId: string, html: string, filename: string,
): Promise<{ path: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session expired. Sign in again and re-run the export.')

  const res = await fetch(RENDER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audit_id: auditId, html, filename }),
  })
  const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
  if (!res.ok || !body.path) throw new Error(body.error ?? `The renderer returned ${res.status}.`)
  return { path: body.path }
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
