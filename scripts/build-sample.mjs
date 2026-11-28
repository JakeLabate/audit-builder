/**
 * Regenerates public/sample-report.json, the document and register the Guide
 * page leafs through.
 *
 * It is a build artifact, committed rather than generated at build time, so
 * the Guide has nothing to fetch from the database and works for someone who
 * has deleted their own sample. Re-run it when the exporter or the sample
 * template changes:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/build-sample.mjs
 */
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const TEMPLATE_AUDIT = 'd0c50000-0000-4000-8000-0000000a0d17'
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env
if (!SUPABASE_URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const rest = async (path) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

const [audit] = await rest(`audits?id=eq.${TEMPLATE_AUDIT}&select=*`)
const [brand] = await rest(`brands?id=eq.${audit.brand_id}&select=*`)
const rows = await rest(`findings?audit_id=eq.${TEMPLATE_AUDIT}&select=*,examples(*)&order=position`)
const scores = await rest(`finding_scores?audit_id=eq.${TEMPLATE_AUDIT}&select=id,score,risk_factor`)
const byId = new Map(scores.map((s) => [s.id, s]))
const scored = rows.map((f) => {
  const s = byId.get(f.id)
  return { ...f, score: s ? Number(s.score) : null, risk_factor: s?.risk_factor ?? null }
})

// The page builder is TypeScript, so bundle it for node rather than duplicating it.
const out = '.sample-build'
execSync(`npx esbuild src/export/pdf.ts src/lib/sheetcols.ts src/lib/score.ts --bundle --format=esm --outdir=${out}`,
  { stdio: 'inherit' })
const { buildPrintDocument } = await import(`../${out}/export/pdf.js`)
const { resolveColumns, withRefs } = await import(`../${out}/lib/sheetcols.js`)
const { bandsFor } = await import(`../${out}/lib/score.js`)

// A band is a position inside the audit, the same rule the app uses, so the
// sample's bands match what the sample audit shows on screen.
const bands = bandsFor(scored)
const findings = scored
  .map((f) => ({ ...f, band: bands.get(f.id) ?? null }))
  .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

const html = buildPrintDocument(brand, audit, findings, 'Jake Labate, SEO Consultant', null, null)
const first = html.indexOf('<div class="page"')
const pages = [...html.slice(first).matchAll(/<div class="page"[\s\S]*?(?=<div class="page"|$)/g)]
  .map((m) => m[0])

const cols = withRefs(resolveColumns(audit, findings), findings)
fs.writeFileSync('public/sample-report.json', JSON.stringify({
  brand: brand.name, title: audit.title, kind: audit.kind,
  head: html.slice(0, first),
  pages,
  register: {
    headers: cols.map((c) => c.header),
    notes: cols.map((c) => c.note),
    widths: cols.map((c) => c.width),
    wrap: cols.map((c) => !!c.wrap),
    rows: findings.map((f) => cols.map((c) => String(c.value(f) ?? ''))),
  },
}))
fs.rmSync(out, { recursive: true, force: true })
console.log(`public/sample-report.json: ${pages.length} pages, ${cols.length} columns`)
console.log(`Now regenerate public/sample-pages/: the flipbook turns images, not live
pages, because rotating an iframe in 3D re-rasterises it every frame. Wrap the
document with buildStandaloneDocument(html, PRINT_CSS, title) so the layout pass
runs, wait for data-fit="done", render each .page at 1191 x 1685 (device scale
1.5) and save as WebP at quality 76, then set "images" in the JSON to their paths
in order. A long finding runs onto a second page, so expect more images than
the source pages above.`)
