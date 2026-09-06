import type { Audit, Brand, FindingFull, PriorityBand } from '../lib/types'

/**
 * Google Sheets export.
 *
 * The sheet is a client-facing deliverable, not a data dump. It ships as four
 * tabs: a summary a stakeholder can read on its own, a curated findings
 * register, a roadmap grouped by wave, and a method page that declares where
 * the evidence came from and how the score is computed.
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

/* ---------- brand ---------- */
/** Sheets takes colors as 0..1 floats, so the document palette is converted once. */
const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
})
const INK = rgb('#191A3E')
const INK_2 = rgb('#3B3D69')
const TEAL = rgb('#0E8C8B')
const WASH = rgb('#F4F4F9')
const LINE = rgb('#E2E2ED')
const MUTED = rgb('#71739A')
const WHITE = rgb('#FFFFFF')
const BAND_BG: Record<PriorityBand, ReturnType<typeof rgb>> = {
  P1: rgb('#F6E4E7'),
  P2: rgb('#FAF0DC'),
  P3: rgb('#ECEAF7'),
  P4: rgb('#F1F1F5'),
}
const BAND_FG: Record<PriorityBand, ReturnType<typeof rgb>> = {
  P1: rgb('#8A1C2B'),
  P2: rgb('#7E550A'),
  P3: rgb('#4B3E96'),
  P4: rgb('#5A5C80'),
}

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

async function getToken(): Promise<string> {
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

async function api(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/* ---------- content ---------- */
const FINDING_COLUMNS = [
  ['Ref', 90],
  ['Finding', 340],
  ['Priority', 90],
  ['Score', 70],
  ['Status', 140],
  ['Owner', 150],
  ['Effort, days', 110],
  ['Wave', 70],
  ['URLs affected', 120],
  ['Templates', 170],
  ['What it costs', 380],
  ['The fix', 380],
  ['How it will be verified', 330],
  ['Verify by', 110],
] as const
/** Columns whose text is long enough to need wrapping, zero indexed. */
const WRAPPED = [1, 9, 10, 11, 12]

const TITLE_CASE = (s: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''

function findingRow(f: FindingFull) {
  return [
    f.ref,
    f.title,
    f.band ?? '',
    f.score ?? '',
    TITLE_CASE(f.status),
    f.owner ?? '',
    f.effort_days ?? '',
    f.wave ?? '',
    f.urls_affected ?? '',
    f.templates.join(', '),
    f.impact_basis ?? '',
    f.action ?? '',
    f.verification_method ?? '',
    f.verify_by ?? '',
  ]
}

export async function exportToSheets(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
  byline = '',
): Promise<string> {
  const token = await getToken()
  const title = `${brand.name} / ${audit.title}`
  const ordered = [...findings].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

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
        { properties: { title: 'Findings', gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 } } },
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

  const roadmap: (string | number)[][] = [['Wave', 'Ref', 'Finding', 'Priority', 'Owner', 'Effort, days']]
  const waves = [...new Set(ordered.map((f) => f.wave ?? 0))].sort((a, b) => a - b)
  for (const w of waves) {
    const inWave = ordered.filter((f) => (f.wave ?? 0) === w)
    const days = inWave.reduce((n, f) => n + (f.effort_days ?? 0), 0)
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
  const method: (string | number)[][] = [
    ['Method and scope'],
    [],
    ['What was examined'],
    [audit.scope_note ?? 'Not stated.'],
    [],
    ['Sources'],
    ['Tool or dataset', 'Window', 'Confidence'],
    ...(sources.length
      ? sources.map((s) => [s.tool ?? '', s.window ?? '', TITLE_CASE(s.confidence ?? '')])
      : [['None declared', '', '']]),
    [],
    ['What was not available'],
    [audit.gaps ?? 'Nothing material was unavailable.'],
    [],
    ['How priority is computed'],
    ['score = 100 x (severity x reach x confidence x leverage) / sqrt(effort days) x risk factor'],
    ['Effort sits under a square root, so a fix taking four times as long is penalised twice, not four times. Without that the register would recommend nothing but trivia.'],
    [],
    ['Band', 'Score', 'Means'],
    ['P1', '80 to 100', 'Do this first. Blocking, or cheap and high leverage.'],
    ['P2', '55 to 79', 'Scheduled work. Real impact, real effort.'],
    ['P3', '30 to 54', 'Worth doing when the surrounding work is open.'],
    ['P4', 'Under 30', 'Monitor. Not worth acting on alone.'],
  ]

  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'Summary!A1', values: summary },
        {
          range: 'Findings!A1',
          values: [FINDING_COLUMNS.map(([h]) => h), ...ordered.map(findingRow)],
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

  const headerRow = (sheetId: number, cols: number) => [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
        cell: {
          userEnteredFormat: {
            backgroundColor: INK,
            verticalAlignment: 'MIDDLE',
            padding: { top: 6, bottom: 6, left: 10, right: 10 },
            textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)',
      },
    },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
  ]

  // Summary: a cover, not a table.
  await safeBatch([
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId: SUM, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
    {
      repeatCell: {
        range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: INK, verticalAlignment: 'MIDDLE', padding: { left: 18, right: 18 }, textFormat: { foregroundColor: WHITE } } },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)',
      },
    },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { fontSize: 22, bold: true, foregroundColor: WHITE } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { textFormat: { fontSize: 13, foregroundColor: WHITE } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: SUM, startRowIndex: 2, endRowIndex: 3 }, cell: { userEnteredFormat: { textFormat: { fontSize: 10, foregroundColor: rgb('#B9BAD4') } } }, fields: 'userEnteredFormat.textFormat' } },
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
  ])

  // Findings: the register.
  await safeBatch([
    ...headerRow(FIND, FINDING_COLUMNS.length),
    ...FINDING_COLUMNS.map(([, w], i) => ({
      updateDimensionProperties: {
        range: { sheetId: FIND, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: w }, fields: 'pixelSize',
      },
    })),
    {
      repeatCell: {
        range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 0, endColumnIndex: FINDING_COLUMNS.length },
        cell: { userEnteredFormat: { verticalAlignment: 'TOP', padding: { top: 6, bottom: 6, left: 10, right: 10 }, textFormat: { fontSize: 10, foregroundColor: INK_2 } } },
        fields: 'userEnteredFormat(verticalAlignment,padding,textFormat)',
      },
    },
    ...WRAPPED.map((c) => ({
      repeatCell: {
        range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy',
      },
    })),
    // the finding itself reads as the row's subject
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 10, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11, foregroundColor: INK } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 10 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    {
      updateBorders: {
        range: { sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 0, endColumnIndex: FINDING_COLUMNS.length },
        innerHorizontal: { style: 'SOLID', color: LINE },
      },
    },
    { setBasicFilter: { filter: { range: { sheetId: FIND, startRowIndex: 0, endRowIndex: ordered.length + 1, startColumnIndex: 0, endColumnIndex: FINDING_COLUMNS.length } } } },
  ])

  // Priority column colored by band, so severity reads at a glance.
  await safeBatch(
    (['P1', 'P2', 'P3', 'P4'] as PriorityBand[]).map((band, i) => ({
      addConditionalFormatRule: {
        index: i,
        rule: {
          ranges: [{ sheetId: FIND, startRowIndex: 1, endRowIndex: ordered.length + 1, startColumnIndex: 2, endColumnIndex: 3 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: band }] },
            format: { backgroundColor: BAND_BG[band], textFormat: { foregroundColor: BAND_FG[band], bold: true } },
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
    { repeatCell: { range: { sheetId: ROAD, startRowIndex: 1, endRowIndex: roadmap.length, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: WASH, textFormat: { bold: true, fontSize: 10, foregroundColor: INK } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { updateBorders: { range: { sheetId: ROAD, startRowIndex: 1, endRowIndex: roadmap.length, startColumnIndex: 0, endColumnIndex: 6 }, innerHorizontal: { style: 'SOLID', color: LINE } } },
  ])

  // Method: a page, not a grid.
  await safeBatch([
    { updateDimensionProperties: { range: { sheetId: METH, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: METH, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
    { repeatCell: { range: { sheetId: METH, startRowIndex: 0, endRowIndex: method.length, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP', textFormat: { fontSize: 10, foregroundColor: INK_2 } } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId: METH, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: INK } } }, fields: 'userEnteredFormat.textFormat' } },
    ...[2, 5, 9, 12].map((r) => ({
      repeatCell: {
        range: { sheetId: METH, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 3 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: TEAL } } },
        fields: 'userEnteredFormat.textFormat',
      },
    })),
  ])

  return created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`
}
