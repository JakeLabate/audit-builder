import type { Audit, Brand, FindingFull } from '../lib/types'
import { identityOf, reportPalette } from '../lib/brand'
import { sectionsOf, type SectionKey } from '../lib/sections'
import { BAND_LABEL } from '../lib/score'
import { getToken } from './sheets'

/**
 * The editable version.
 *
 * Drive converts uploaded HTML into a real Google Doc, so the same sections
 * and the same brand kit produce something the client can rewrite, comment on
 * and send round. It is not the PDF: Docs has no page geometry, so the print
 * stylesheet is no use here and the document is rebuilt with inline styles
 * that survive the conversion.
 *
 * Scope stays drive.file, so the app can only ever touch documents it made.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

const BREAK = 'page-break-before:always'

export function buildDocHtml(
  brand: Brand, audit: Audit, findings: FindingFull[], byline: string,
): string {
  const id = identityOf(brand)
  const pal = reportPalette(id)
  const ordered = [...findings].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const counts: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 }
  for (const f of ordered) if (f.band) counts[f.band]++
  const effort = ordered.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)

  const h1 = `font-size:26pt;color:${pal.ink};margin:0 0 6pt`
  const h2 = `font-size:16pt;color:${pal.ink};margin:22pt 0 6pt;border-bottom:1pt solid ${pal.rule};padding-bottom:4pt`
  const h3 = `font-size:12pt;color:${pal.ink};margin:16pt 0 4pt`
  const lab = `font-size:8pt;color:#71739A;letter-spacing:1pt;text-transform:uppercase;margin:0 0 2pt`
  const cell = 'border:1pt solid #DFDFEA;padding:5pt 7pt;font-size:9.5pt;vertical-align:top'
  const th = `${cell};background:${pal.wash};font-weight:bold`

  const table = (head: string[], rows: string[][]) => `
    <table style="border-collapse:collapse;width:100%;margin:6pt 0">
      <tr>${head.map((h) => `<td style="${th}">${esc(h)}</td>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((c) => `<td style="${cell}">${c}</td>`).join('')}</tr>`).join('')}
    </table>`

  const parts: Record<SectionKey, () => string> = {
    cover: () => `
      <p style="${lab}">Technical SEO Audit</p>
      <h1 style="${h1}">${esc(audit.title)}</h1>
      <p style="font-size:13pt;color:${pal.ink};margin:0">${esc(id.legal_name ?? brand.name)}${
        brand.domain ? ` &middot; ${esc(brand.domain)}` : ''}</p>
      ${id.slogan ? `<p style="font-size:11pt;color:#71739A;margin:4pt 0 0">${esc(id.slogan)}</p>` : ''}
      <p style="font-size:9.5pt;color:#71739A;margin:16pt 0 0">${esc(byline)} &middot; ${
        esc(audit.delivered_on ?? new Date().toISOString().slice(0, 10))}</p>
      ${id.contact.name ? `<p style="font-size:9.5pt;color:#71739A;margin:2pt 0 0">Prepared for ${
        esc(id.contact.name)}${id.contact.role ? `, ${esc(id.contact.role)}` : ''}</p>` : ''}`,

    summary: () => {
      const byPillar = new Map<string, number>()
      for (const f of ordered) {
        const k = f.pillar ?? 'Unsorted'
        byPillar.set(k, (byPillar.get(k) ?? 0) + 1)
      }
      return `<h2 style="${h2};${BREAK}">What we found</h2>
        <p style="font-size:11pt;margin:0 0 8pt">${ordered.length} findings, ${effort} engineering days of work.</p>
        ${table(['Priority', 'Findings'],
          (['P1', 'P2', 'P3', 'P4'] as const).map((b) => [`${b} ${BAND_LABEL[b]}`, String(counts[b] ?? 0)]))}
        <h3 style="${h3}">Where they sit</h3>
        ${table(['Pillar', 'Findings'], [...byPillar.entries()].sort((a, b) => b[1] - a[1])
          .map(([p, n]) => [esc(p), String(n)]))}`
    },

    contents: () => `<h2 style="${h2};${BREAK}">Contents</h2>
      ${table(['Ref', 'Finding', 'Priority'],
        ordered.map((f) => [esc(f.ref), esc(f.title), esc(f.band ?? '')]))}`,

    method: () => `<h2 style="${h2};${BREAK}">Method and scope</h2>
      ${audit.scope_note ? `<p style="font-size:10.5pt;margin:0 0 8pt">${esc(audit.scope_note)}</p>` : ''}
      ${(audit.sources ?? []).length ? `<h3 style="${h3}">What it was built from</h3>
        ${table(['Source', 'Window', 'Confidence'],
          (audit.sources ?? []).map((s) => [esc(s.tool), esc(s.window), esc(s.confidence)]))}` : ''}
      ${audit.gaps ? `<h3 style="${h3}">What it could not see</h3>
        <p style="font-size:10.5pt;margin:0">${esc(audit.gaps)}</p>` : ''}
      <h3 style="${h3}">How priority is worked out</h3>
      <p style="font-size:10.5pt;margin:0 0 8pt">score = 3 &times; (severity &times; reach &times;
        confidence &times; leverage) &divide; sqrt(effort) &times; risk factor, capped at 100.</p>
      ${table(['Band', 'Score', 'What it means'], [
        ['P1', '80 to 100', 'Do this first'], ['P2', '55 to 79', 'Scheduled work'],
        ['P3', '30 to 54', 'Do alongside'], ['P4', 'Under 30', 'Monitor'],
      ])}`,

    findings: () => ordered.map((f) => `
      <h2 style="${h2};${BREAK}">${esc(f.ref)} &nbsp; ${esc(f.title)}</h2>
      <p style="${lab}">${esc(f.band ?? 'Unscored')}${f.band ? ` &middot; ${BAND_LABEL[f.band]}` : ''}
        &nbsp;&middot;&nbsp; score ${f.score ?? '--'}</p>
      ${f.impact_basis ? `<p style="font-size:10.5pt;margin:8pt 0 0">${esc(f.impact_basis)}</p>` : ''}
      ${f.measurements.length ? `<h3 style="${h3}">The evidence</h3>
        ${table(['Check', 'Result', 'Taken'],
          f.measurements.map((m) => [esc(m.check), esc(m.result), esc(m.taken)]))}` : ''}
      ${f.action ? `<h3 style="${h3}">The fix</h3>
        <p style="font-size:10.5pt;margin:0">${esc(f.action)}</p>` : ''}
      ${f.steps.length ? `<ol style="font-size:10.5pt;margin:6pt 0 0">${
        f.steps.map((st) => `<li style="margin-bottom:3pt">${esc(st)}</li>`).join('')}</ol>` : ''}
      ${table(['URLs affected', 'Effort', 'Owner', 'Verify by'], [[
        esc(f.urls_affected ?? '--'),
        f.effort_days != null ? `${f.effort_days} days` : '--',
        esc(f.owner ?? 'unassigned'), esc(f.verify_by ?? '--'),
      ]])}
      ${f.verification_method ? `<h3 style="${h3}">How it will be verified</h3>
        <p style="font-size:10.5pt;margin:0">${esc(f.verification_method)}</p>` : ''}`).join(''),

    roadmap: () => {
      const waves = new Map<number, FindingFull[]>()
      for (const f of ordered) {
        const w = f.wave ?? 99
        if (!waves.has(w)) waves.set(w, [])
        waves.get(w)!.push(f)
      }
      return `<h2 style="${h2};${BREAK}">Roadmap</h2>
        <p style="font-size:11pt;margin:0 0 8pt">${effort} engineering days, in ${waves.size} ${
          waves.size === 1 ? 'wave' : 'waves'}.</p>
        ${[...waves.entries()].sort((a, b) => a[0] - b[0]).map(([w, items]) => {
          const e = items.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)
          return `<h3 style="${h3}">${w === 99 ? 'Unscheduled' : `Wave ${w}`} &middot; ${
            items.length} ${items.length === 1 ? 'finding' : 'findings'} &middot; ${e} ${
            e === 1 ? 'day' : 'days'}</h3>
            ${table(['Ref', 'Finding', 'Owner', 'Days'], items.map((f) => [
              esc(f.ref), esc(f.title), esc(f.owner ?? 'unassigned'), esc(f.effort_days ?? '--'),
            ]))}`
        }).join('')}`
    },

    appendix: () => `<h2 style="${h2};${BREAK}">How to read this</h2>
      ${table(['Part', 'What it is telling you'], [
        ['The title', 'Stated as a claim, so it is something you can agree or disagree with.'],
        ['The evidence', 'Each check we ran, what it returned, and the date.'],
        ['The score', 'Built from severity, reach, evidence strength, leverage, effort and the risk of the fix.'],
        ['Effort', 'Engineering days, estimated. It feeds the score.'],
        ['Verify by', 'When the check should be re-run. It was written before the fix, not after.'],
      ])}
      <p style="font-size:10.5pt;margin:10pt 0 0">If a finding says something you know to be
        wrong, say so. The record is built to be argued with.</p>`,
  }

  const body = sectionsOf(audit).filter((s) => s.on).map((s) => parts[s.key]?.() ?? '').join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(audit.title)}</title></head>
    <body style="font-family:Arial,sans-serif;color:#2B2C63;line-height:1.5">${body}</body></html>`
}

/**
 * Upload as HTML and let Drive convert. Building the doc through the Docs API
 * would mean re-expressing every heading and table as an index-addressed
 * batch update, which is a great deal of code to arrive at the same document.
 */
export async function exportToDoc(
  brand: Brand, audit: Audit, findings: FindingFull[], byline = '',
): Promise<string> {
  const token = await getToken()
  const html = buildDocHtml(brand, audit, findings, byline)
  const boundary = 'ab' + crypto.randomUUID().replace(/-/g, '')
  const meta = {
    name: `${brand.name} / ${audit.title}`,
    mimeType: 'application/vnd.google-apps.document',
  }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n` +
    `--${boundary}--`

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Google could not create the document. ${res.status}: ${t.slice(0, 200)}`)
  }
  const { id } = (await res.json()) as { id: string }
  return `https://docs.google.com/document/d/${id}/edit`
}
