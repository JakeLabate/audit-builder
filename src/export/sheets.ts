import type { Audit, Brand, FindingFull, PriorityBand } from '../lib/types'
import { resolveColumns, withRefs, type SheetCol } from '../lib/sheetcols'
import { clientFindings } from '../lib/depth'
import { auditScopeOf, baselineText, kpisOf, themesOf } from '../lib/overview'
import { sheetTheme } from '../lib/sheettheme'
import type { SheetDesignKey } from '../lib/designs'

/**
 * Google Sheets export.
 *
 * The sheet is a client-facing deliverable, not a data dump. It ships as four
 * tabs: a summary a stakeholder can read on its own, a curated findings
 * register, a roadmap grouped by wave, and a method page that declares where
 * the evidence came from and how the score is computed.
 *
 * How it looks is a design, resolved by the caller (see lib/designs) and
 * turned into plain values by lib/sheettheme. A design changes formatting
 * only: the tabs, the columns and every value are the same in all of them.
 *
 * Scope is drive.file only, which Google classifies as non-sensitive: the app
 * can create files and touch files it created, and nothing else in the user's
 * Drive. That keeps this out of the sensitive-scope verification queue.
 *
 * Token flow is the implicit Google Identity Services client, so there is no
 * server and no refresh token stored anywhere.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GSI = 'https://accounts.google.com/gsi/client'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string
            scope: string
            callback: (r: { access_token?: string; error?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

/* ---------- colour ---------- */
/** Sheets takes colors as 0..1 floats. */
const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
})
const WHITE = rgb('#FFFFFF')

/* ---------- auth ---------- */
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Google script failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = GSI
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google script failed to load'))
    document.head.appendChild(s)
  })
}

export function sheetsConfigured(): boolean {
  // A real Google client id always ends in .apps.googleusercontent.com.
  // Checking the shape rather than just presence means a placeholder value
  // leaves the button disabled instead of enabling it to fail on click.
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return Boolean(id && id.endsWith('.apps.googleusercontent.com'))
}

export async function getToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('Google export is not configured. Set VITE_GOOGLE_CLIENT_ID.')
  await loadGsi()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token)
        else reject(new Error(r.error ?? 'Google declined the request.'))
      },
    })
    client.requestAccessToken()
  })
}

/** Google answers 429 and 5xx when it is busy, not when the request is wrong.
 *  Those are retried a few times before the export gives up. */
const RETRY = new Set([429, 500, 502, 503, 504])

async function api(token: string, url: string, init?: RequestInit) {
  let last = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)))
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (res.ok) return res.json()
    const body = await res.text()
    last = `Google API ${res.status}: ${body.slice(0, 300)}`
    if (!RETRY.has(res.status)) break
  }
  throw new Error(last)
}

/* ---------- content ---------- */
/** Columns whose text is long enough to need wrapping, zero indexed. */

const TITLE_CASE = (s: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''


export async function exportToSheets(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
  byline = '',
  /** How it looks. The caller resolves it from the audit, its brand and the
   *  workspace. Classic is the register as it has always been. */
  design: SheetDesignKey = 'classic',
): Promise<string> {
  const token = await getToken()
  // Every colour below comes from the theme, and the theme comes from the
  // brand kit, so the register is the client's as much as the document is.
  const th = sheetTheme(brand, design)
  const INK = rgb(th.ink)
  const INK_2 = rgb(th.ink2)
  const ACCENT = rgb(th.accent)
  const LINE = rgb(th.line)
  const MUTED = rgb(th.muted)
  const title = `${brand.name} / ${audit.title}`
  // The register is complete, but an internal finding is still not the
  // client's to read. Same rule as the document.
  const ordered = clientFindings(findings).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  // Which columns, in which order. Chosen on the audit, or, when nobody has
  // chosen, every column at least one finding fills.
  const cols: SheetCol[] = withRefs(resolveColumns(audit, findings), findings)

  const counts: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 }
  let effort = 0
  for (const f of ordered) {
    if (f.band) counts[f.band]++
    effort += f.effort_days ?? 0
  }

  /* ---- create with all four tabs, and read the ids back ---- */
  const created = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Summary', gridProperties: { hideGridlines: true } } },
        { properties: { title: 'Findings', gridProperties: { frozenRowCount: 2, frozenColumnCount: 2 } } },
        { properties: { title: 'Roadmap', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Method', gridProperties: { hideGridlines: true } } },
      ],
    }),
  })
  const id: string = created.spreadsheetId
  // Google assigns ids at creation. Read them back rather than assuming 0,
  // which is only correct for an unnamed default sheet.
  const sheetIdOf = (name: string): number =>
    created.sheets?.find((s: { properties: { title: string } }) => s.properties.title === name)
      ?.properties?.sheetId ?? 0
  const SUM = sheetIdOf('Summary')
  const FIND = sheetIdOf('Findings')
  const ROAD = sheetIdOf('Roadmap')
  const METH = sheetIdOf('Method')

  /* ---- values ---- */
  const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const summary = [
    [brand.name],
    [audit.title],
    [`${byline}${byline ? '  ·  ' : ''}${audit.delivered_on ?? today}`],
    [],
    ['Findings', ordered.length],
    ['P1, do first', counts.P1],
    ['P2, scheduled', counts.P2],
    ['P3, do alongside', counts.P3],
    ['P4, monitor', counts.P4],
    ['Total effort, days', Number(effort.toFixed(1))],
    ['URLs crawled', audit.urls_crawled ?? ''],
    [],
    ['How to read this'],
    ['Every finding is the same record: what is wrong, how we know, what it costs, what to do about it, and the exact check that will prove it is fixed.'],
    ['Priority is computed from severity, reach, confidence, leverage, effort and risk. It is not an opinion about ordering. The Method tab shows the calculation.'],
    ['Any number asserted in "What it costs" states where it came from. Nothing is published that cannot.'],
  ]

  // The written summary and the themes from the Overview, under the counts.
  // Rows are recorded as they are added so they can be formatted after.
  const sumHeads: number[] = []
  const sumParas: number[] = []
  if (audit.summary?.trim()) {
    summary.push([])
    sumHeads.push(summary.length); summary.push(['In short'])
    for (const para of audit.summary.trim().split(/\n\s*\n/)) { sumParas.push(summary.length); summary.push([para.trim()]) }
  }
  const refIn = new Map(ordered.map((f) => [f.id, f.ref]))
  const themes = themesOf(audit).filter((t) => t.title.trim())
  if (themes.length) {
    summary.push([])
    sumHeads.push(summary.length); summary.push(['Themes'])
    for (const t of themes) {
      summary.push([t.title.trim(), t.finding_ids.map((id) => refIn.get(id)).filter(Boolean).join(', ')])
      if (t.note.trim()) { sumParas.push(summary.length); summary.push([t.note.trim()]) }
    }
  }

  const roadmap: (string | number)[][] = [['Wave', 'Ref', 'Finding', 'Priority', 'Owner', 'Effort, days']]
  const waves = [...new Set(ordered.map((f) => f.wave ?? 0))].sort((a, b) => a - b)
  // Which rows head a wave, so a design can set them apart from the findings.
  const waveRows: number[] = []
  for (const w of waves) {
    const inWave = ordered.filter((f) => (f.wave ?? 0) === w)
    const days = inWave.reduce((n, f) => n + (f.effort_days ?? 0), 0)
    waveRows.push(roadmap.length)
    roadmap.push([
      w ? `Wave ${w}` : 'Unassigned',
      '', `${inWave.length} finding${inWave.length === 1 ? '' : 's'}`, '', '',
      Number(days.toFixed(1)),
    ])
    for (const f of inWave) {
      roadmap.push(['', f.ref, f.title, f.band ?? '', f.owner ?? '', f.effort_days ?? ''])
    }
  }

  const sources = Array.isArray(audit.sources) ? audit.sources : []
  // Built row by row, so each heading's row is known for formatting however
  // many rows the brief and the scope turn out to need.
  const method: (string | number)[][] = [['Method and scope'], []]
  const methodHeads: number[] = []
  const head = (t: string) => { methodHeads.push(method.length); method.push([t]) }

  const kpis = kpisOf(audit).filter((k) => k.name.trim())
  if (audit.question?.trim() || audit.objective?.trim() || kpis.length) {
    head('The brief')
    if (audit.question?.trim()) method.push([audit.question.trim()])
    if (audit.objective?.trim()) method.push([audit.objective.trim()])
    const who = [audit.commissioned_by?.trim() ? `Commissioned by ${audit.commissioned_by.trim()}` : '',
      audit.due_on ? `Due ${audit.due_on}` : ''].filter(Boolean).join('. ')
    if (who) method.push([who])
    method.push([])
    if (kpis.length) {
      head('Judged on')
      method.push(['Number', 'Where it stood', 'As of, and source'])
      for (const k of kpis) {
        method.push([k.name, k.baseline == null ? 'Not measured' : baselineText(k), [k.as_of, k.source].filter(Boolean).join(', ')])
      }
      method.push([])
    }
  }

  const sc = auditScopeOf(audit)
  head('What was examined')
  for (const [label, v] of [['Domains', sc.hosts], ['Markets', sc.markets], ['Page types', sc.templates], ['Devices', sc.devices]] as [string, string[]][]) {
    if (v.length) method.push([label, v.join(', ')])
  }
  const scoped = sc.hosts.length + sc.markets.length + sc.templates.length + sc.devices.length > 0
  if (audit.scope_note?.trim() || !scoped) method.push([audit.scope_note?.trim() || 'Not stated.'])
  method.push([])
  if (sc.excluded.length) {
    head('What was left out')
    for (const x of sc.excluded) method.push([x])
    method.push([])
  }

  head('Sources')
  method.push(['Tool or dataset', 'Window', 'Confidence'])
  method.push(...(sources.length
    ? sources.map((s) => [s.tool ?? '', s.window ?? '', TITLE_CASE(s.confidence ?? '')])
    : [['None declared', '', '']]))
  method.push([])
  head('What was not available')
  method.push([audit.gaps ?? 'Nothing material was unavailable.'])
  method.push([])
  head('How priority is computed')
  method.push(
    ['score = 3 x (severity x reach x confidence x leverage) / sqrt(effort days) x risk factor'],
    ['Effort sits under a square root, so a fix taking four times as long is penalised twice, not four times. Without that the register would recommend nothing but trivia.'],
    ['The band is a position inside this audit, not a fixed number: P1 is the most urgent work here rather than a score above a threshold. Findings that score the same always share a band. The score column keeps this audit comparable with another.'],
    [],
    ['Band', 'Share of this audit', 'Means'],
    ['P1', 'Top 15%', 'Do this first. Blocking, or cheap and high leverage.'],
    ['P2', 'Next 25%', 'Scheduled work. Real impact, real effort.'],
    ['P3', 'Next 30%', 'Worth doing when the surrounding work is open.'],
    ['P4', 'The rest', 'Monitor. Not worth acting on alone.'],
  )

  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'Summary!A1', values: summary },
        {
          range: 'Findings!A1',
          values: [
            cols.map((c) => c.header),
            // A register goes to people who were not in the audit. A bare
            // header tells them nothing, so every column says what it means.
            cols.map((c) => c.note),
            ...ordered.map((f) => cols.map((c) => c.value(f))),
          ],
        },
        { range: 'Roadmap!A1', values: roadmap },
        { range: 'Method!A1', values: method },
        { range: 'Full record!A1', values: [] },
      ].filter((d) => d.values.length),
    }),
  })

  /* ---- formatting ----
     Sent in groups, each tolerated separately. Formatting is cosmetic and must
     never be able to destroy a spreadsheet whose data already landed. */
  const safeBatch = async (requests: unknown[]) => {
    if (!requests.length) return
    try {
      await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests }),
      })
    } catch {
      /* keep going: the data is already written */
    }
  }

  /** The row under the header. Quieter than the data, italic, wrapped, so it
   *  reads as guidance and nobody mistakes it for a finding. */
  const noteRow = (sheetId: number, n: number) => [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: n },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(th.note.bg),
            verticalAlignment: 'TOP',
            wrapStrategy: 'WRAP',
            padding: { top: 6, bottom: 6, left: 10, right: 10 },
            textFormat: { foregroundColor: rgb(th.note.fg), italic: true, fontSize: 9 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy,padding,textFormat)',
      },
    },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 56 }, fields: 'pixelSize' } },
  ]

  const headerRow = (sheetId: number, cols: number) => [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(th.header.bg),
            verticalAlignment: 'MIDDLE',
            padding: { top: 6, bottom: 6, left: 10, right: 10 },
            textFormat: { foregroundColor: rgb(th.header.fg), bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)',
      },
    },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    // A header set in ink on white needs its line, or it is just a bold row.
    ...(th.header.rule ? [{
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
        bottom: { style: 'SOLID_MEDIUM', color: rgb(th.header.rule) },
      },
    }] : []),
  ]

  /** Lines between cells, as the design draws them. */
  const cellLines = (sheetId: number, from: number, to: number, n: number): unknown[] => {
    const range = { sheetId, startRowIndex: from, endRowIndex: to, startColumnIndex: 0, endColumnIndex: n }
    if (to <= from || th.grid === 'none') return []
    const line = { style: 'SOLID', color: LINE }
    return [{
      updateBorders: th.grid === 'all'
        ? { range, top: line, bottom: line, left: line, right: line, innerHorizontal: line, innerVertical: line }
        : { range, innerHorizontal: line },
    }]
  }

  // Summary: a cover, not a table. A design either fills the block at the top
  // with the brand colour or sets the title in ink over a brand rule.
  const COVER_BG = th.cover ? rgb(th.cover.bg) : WHITE
  const COVER_FG = th.cover ? rgb(th.cover.fg) : INK
  const COVER_SUB = th.cover ? rgb(th.cover.sub) : MUTED
  const COVER_PAD = th.cover ? 18 : 4
  await safeBatch([
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    {
      repeatCell: {
        range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: COVER_BG, verticalAlignment: 'MIDDLE', padding: { left: COVER_PAD, right: COVER_PAD }, textFormat: { foregroundColor: COVER_FG } } },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)',
      },
    },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { fontSize: 22, bold: true, foregroundColor: COVER_FG } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { textFormat: { fontSize: 13, foregroundColor: COVER_FG } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 2, endRowIndex: 3 }, cell: { userEnteredFormat: { textFormat: { fontSize: 10, foregroundColor: COVER_SUB } } }, fields: 'userEnteredFormat.textFormat' } },
    // With no filled block, a brand rule under the three lines closes the title.
    ...(th.coverRule ? [{
      updateBorders: {
        range: { sheetId: SUM, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
        bottom: { style: 'SOLID_THICK', color: rgb(th.coverRule) },
      },
    }] : []),
    { updateDimensionProperties: { range: { sheetId: SUM, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 54 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: SUM, dimension: 'ROWS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: SUM, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: SUM, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
    // stat labels and their figures
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 4, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: INK_2 }, padding: { left: 4 } } }, fields: 'userEnteredFormat(textFormat,padding)' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 4, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12, foregroundColor: INK }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment)' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 12, endRowIndex: 13 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 13, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', textFormat: { foregroundColor: MUTED, fontSize: 10 } } }, fields: 'userEnteredFormat(wrapStrategy,textFormat)' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    ...sumHeads.map((r) => ({ repeatCell: { range: { sheetId: SUM, startRowIndex: r, endRowIndex: r + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } })),
    ...sumParas.flatMap((r) => [
      { mergeCells: { range: { sheetId: SUM, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
      { repeatCell: { range: { sheetId: SUM, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP', textFormat: { foregroundColor: INK_2, fontSize: 10 } } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)' } },
    ]),
  ])

  // Findings: the register.
  await safeBatch([
    ...headerRow(FIND, cols.length),
    ...noteRow(FIND, cols.length),
    ...cols.map((c, i) => ({
      updateDimensionProperties: {
        range: { sheetId: FIND, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: c.width }, fields: 'pixelSize',
      },
    })),
    {
      repeatCell: {
        range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 0, endColumnIndex: cols.length },
        cell: { userEnteredFormat: { verticalAlignment: 'TOP', padding: { top: 6, bottom: 6, left: 10, right: 10 }, textFormat: { fontSize: 10, foregroundColor: INK_2 } } },
        fields: 'userEnteredFormat(verticalAlignment,padding,textFormat)',
      },
    },
    ...cols.flatMap((c, i) => (c.wrap ? [{
      repeatCell: {
        range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: i, endColumnIndex: i + 1 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy',
      },
    }] : [])),
    // the finding itself reads as the row's subject
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 10, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11, foregroundColor: INK } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 10 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    ...cellLines(FIND, 2, ordered.length + 2, cols.length),
    { setBasicFilter: { filter: { range: { sheetId: FIND, startRowIndex: 0, endRowIndex: ordered.length + 2, startColumnIndex: 0, endColumnIndex: cols.length } } } },
  ])

  // Priority column colored by band, so severity reads at a glance.
  await safeBatch(
    (['P1', 'P2', 'P3', 'P4'] as PriorityBand[]).map((band, i) => ({
      addConditionalFormatRule: {
        index: i,
        rule: {
          ranges: [{ sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 2, endColumnIndex: 3 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: band }] },
            format: {
              ...(th.bands[band].bg ? { backgroundColor: rgb(th.bands[band].bg!) } : {}),
              textFormat: { foregroundColor: rgb(th.bands[band].fg), bold: true },
            },
          },
        },
      },
    })),
  )

  // Roadmap: wave rows lead, findings sit under them.
  await safeBatch([
    ...headerRow(ROAD, 6),
    ...[220, 90, 400, 90, 160, 110].map((w, i) => ({
      updateDimensionProperties: { range: { sheetId: ROAD, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' },
    })),
    { repeatCell: { range: { sheetId: ROAD, startRowIndex: 1, endRowIndex: roadmap.length, startColumnIndex: 0, endColumnIndex: 6 }, cell: { userEnteredFormat: { verticalAlignment: 'TOP', padding: { top: 5, bottom: 5, left: 10, right: 10 }, wrapStrategy: 'WRAP', textFormat: { fontSize: 10, foregroundColor: INK_2 } } }, fields: 'userEnteredFormat(verticalAlignment,padding,wrapStrategy,textFormat)' } },
    { repeatCell: { range: { sheetId: ROAD, startRowIndex: 1, endRowIndex: roadmap.length, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: th.wave.full ? WHITE : rgb(th.wave.bg), textFormat: { bold: true, fontSize: 10, foregroundColor: INK } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    ...cellLines(ROAD, 1, roadmap.length, 6),
    // A design that fills its wave headings fills the whole row, so a wave
    // reads as a band across the sheet with its findings under it.
    ...(th.wave.full ? waveRows.map((r) => ({
      repeatCell: {
        range: { sheetId: ROAD, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: rgb(th.wave.bg), textFormat: { bold: true, fontSize: 10, foregroundColor: rgb(th.wave.fg) } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    })) : []),
    // With no lines and no fill, a wave heading still needs something over it.
    ...(th.grid === 'none' ? waveRows.map((r) => ({
      updateBorders: {
        range: { sheetId: ROAD, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 6 },
        top: { style: 'SOLID', color: INK },
      },
    })) : []),
  ])

  // Method: a page, not a grid.
  await safeBatch([
    { updateDimensionProperties: { range: { sheetId: METH, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: METH, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
    { repeatCell: { range: { sheetId: METH, startRowIndex: 0, endRowIndex: method.length, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP', textFormat: { fontSize: 10, foregroundColor: INK_2 } } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId: METH, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } },
    ...methodHeads.map((r) => ({
      repeatCell: {
        range: { sheetId: METH, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 3 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: ACCENT } } },
        fields: 'userEnteredFormat.textFormat',
      },
    })),
  ])

  /* ---- what only some designs have ----
     Each in a batch of its own. They are the newest requests here and the
     least essential, so if Google refuses one it costs that one touch and
     nothing that was already applied. */

  // Stripes on every other finding.
  if (th.zebra && ordered.length > 0) {
    await safeBatch([{
      addBanding: {
        bandedRange: {
          range: { sheetId: FIND, startRowIndex: 2, endRowIndex: ordered.length + 2, startColumnIndex: 0, endColumnIndex: cols.length },
          rowProperties: { firstBandColor: WHITE, secondBandColor: rgb(th.zebra) },
        },
      },
    }])
  }

  // The sheet's own gridlines off, where the design draws its own or none.
  if (!th.gridlines) {
    await safeBatch([FIND, ROAD].map((sheetId) => ({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { hideGridlines: true } },
        fields: 'gridProperties.hideGridlines',
      },
    })))
  }

  // Tabs in the brand colour.
  if (th.tab) {
    await safeBatch([SUM, FIND, ROAD, METH].map((sheetId) => ({
      updateSheetProperties: {
        properties: { sheetId, tabColorStyle: { rgbColor: rgb(th.tab!) } },
        fields: 'tabColorStyle',
      },
    })))
  }

  // The brand's faces, last. Every request above that sets a text format
  // replaces the whole format, family included, so the family is laid over
  // the finished sheet with a mask that touches nothing else.
  if (th.font) {
    const family = (sheetId: number, fontFamily: string, rows?: [number, number]) => ({
      repeatCell: {
        range: rows ? { sheetId, startRowIndex: rows[0], endRowIndex: rows[1] } : { sheetId },
        cell: { userEnteredFormat: { textFormat: { fontFamily } } },
        fields: 'userEnteredFormat.textFormat.fontFamily',
      },
    })
    const head = th.headFont ?? th.font
    await safeBatch([SUM, FIND, ROAD, METH].map((sheetId) => family(sheetId, th.font!)))
    await safeBatch([
      family(SUM, head, [0, 2]),
      family(FIND, head, [0, 1]),
      family(ROAD, head, [0, 1]),
      family(METH, head, [0, 1]),
      ...methodHeads.map((r) => family(METH, head, [r, r + 1])),
      ...sumHeads.map((r) => family(SUM, head, [r, r + 1])),
    ])
  }

  return created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`
}
