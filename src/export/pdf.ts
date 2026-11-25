import type { Audit, Brand, Example, FindingFull } from '../lib/types'
import { categoryOf, isCategoryPath } from '../lib/taxonomy'
import { BAND_LABEL } from '../lib/score'
import { contrast, fontHref, identityOf, reportPalette, shade } from '../lib/brand'
import { sectionsOf, type SectionKey } from '../lib/sections'
import { clientFindings } from '../lib/depth'
import { kindOf } from '../lib/kind'
import { scopeOf } from '../lib/scope'

/**
 * PDF export. The browser's own print engine does the rendering, so there is
 * no service to run and no cost. The stylesheet uses @page and mm units,
 * matching the document system the audits are designed in.
 *
 * One rule runs through the whole file: a part of the document exists only
 * when the audit has something to put in it. A finding can carry four fields
 * or forty, an audit can be scored or not, scheduled or not, and each of
 * those has to come out as a finished page rather than a template with
 * holes in it. So nothing prints a placeholder: no "--", no "not scored", no
 * "unassigned", no empty box, no zero that only means "not filled in".
 *
 * The second rule is that nothing is dropped. A page that runs long spills
 * onto a continuation page (see LAYOUT_SCRIPT) instead of being shrunk until
 * it is unreadable or cut with a note.
 */

/* ------------------------------------------------------------------ text */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Has something a reader could see. */
const has = (v: unknown): boolean =>
  v != null
  && !(typeof v === 'string' && v.trim() === '')
  && !(Array.isArray(v) && v.length === 0)

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const words = (s: string | null | undefined) => cap(String(s ?? '').replace(/_/g, ' '))
const count = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']
/** 2025-05-09 as May 9, 2025. Parsed by hand so a time zone cannot move it. */
function day(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''))
  if (!m) return String(d ?? '')
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}

/** Escaped text with its web addresses made into links. */
function rich(text: unknown): string {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => {
    const tail = /[.,;:)\]]+$/.exec(u)?.[0] ?? ''
    const url = tail ? u.slice(0, -tail.length) : u
    return `<a href="${url}">${url}</a>${tail}`
  })
}

/** Text as paragraphs. A blank line starts a new one; a single break stays. */
function paras(text: unknown, cls = 'body'): string[] {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="${cls}">${rich(p).replace(/\n/g, '<br>')}</p>`)
}

/* ---------------------------------------------------------------- blocks */

/** A labelled block that stays in one piece. */
const blk = (label: string, inner: string, cls = '') =>
  inner ? `<section class="blk${cls ? ' ' + cls : ''}"><div class="sect">${esc(label)}</div>${inner}</section>` : ''

/**
 * A labelled block whose items can be divided between two pages. `wrap` is
 * the element that holds the items, written with a %s where they go; `once`
 * is anything that belongs with the first part only.
 */
function splitBlk(label: string, items: string[], wrap: string, cls = '', once = ''): string {
  if (!items.length) return once ? blk(label, once, cls) : ''
  return `<section class="blk${cls ? ' ' + cls : ''}" data-split><div class="sect">${esc(label)}</div>` +
    (once ? `<div data-once>${once}</div>` : '') +
    wrap.replace('%s', items.join('')) + '</section>'
}

/** A page with a running foot. `cont` names it on any page it runs onto. */
function pageOf(
  o: { kind: string; label: string; cont: string; ref?: string; fid?: string },
  inner: string, running: string, folio: number,
): string {
  return `<div class="page" data-kind="${o.kind}" data-cont="${esc(o.cont)}"` +
    (o.ref ? ` data-contref="${esc(o.ref)}"` : '') + (o.fid ? ` data-fid="${esc(o.fid)}"` : '') +
    `><div class="pg"><div class="flow">${inner}</div>` +
    `<div class="foot"><span>${esc(o.label)}</span><span>${esc(running)}</span><span class="folio">${folio}</span></div>` +
    `</div></div>`
}

/* --------------------------------------------------------------- finding */

const SEV: Record<string, string> = { P1: 'crit', P2: 'high', P3: 'med', P4: 'med' }
const HARM: Record<string, string> = {
  duplicate_content: 'Duplicate content', crawl_waste: 'Crawl waste', lost_visibility: 'Lost visibility',
  broken_experience: 'Broken experience', compliance_exposure: 'Compliance exposure',
}
const HORIZON: Record<string, string> = {
  already_happening: 'Already happening', next_crawl_cycle: 'Next crawl cycle',
  next_release: 'Next release', latent: 'Latent',
}
const WHO: Record<string, string> = {
  end_users: 'People using the site', crawlers: 'Search engines and crawlers', internal_team: 'The internal team',
}

/** Where the finding happens, in words a client reads rather than a count. */
function whereOf(f: FindingFull): string {
  const segs = scopeOf(f.scope).segments
  const bits = segs.map((s) => {
    if (s.type === 'sitewide') return 'Sitewide'
    if (s.type === 'pages') return count((s.urls ?? []).length, 'page')
    return s.name ? `${s.name} ${s.type}` : ''
  }).filter(Boolean)
  if (bits.length) return bits.join(', ')
  return (f.templates ?? []).join(', ')
}

/** The facts strip: one cell for each fact this finding actually has. */
function facts(f: FindingFull): string {
  const cells: string[] = []
  const add = (k: string, v: unknown) => {
    if (has(v)) cells.push(`<div class="fact"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`)
  }
  if (f.score != null) {
    cells.push(`<div class="fact lead"><div class="k">Priority</div>
      <div class="v">${esc(f.band ?? '')}<small>${f.score} of 100</small></div>
      ${f.band ? `<div class="s">${esc(BAND_LABEL[f.band])}</div>` : ''}</div>`)
  }
  add('Effort', f.effort_days != null ? count(Number(f.effort_days), 'engineering day') : null)
  add('Owner', f.owner)
  add('Where', whereOf(f))
  // A scope made only of listed pages already says how many. Printing the
  // same number again beside it under another name is noise.
  const segs = scopeOf(f.scope).segments
  const listed = segs.length > 0 && segs.every((s) => s.type === 'pages')
  add('URLs affected', f.urls_affected != null && !listed ? f.urls_affected.toLocaleString('en-US') : null)
  add('Exposure', f.quantity_value != null
    ? `${Number(f.quantity_value).toLocaleString('en-US')} ${f.quantity_unit ?? ''}`.trim() : null)
  add('Metric at risk', f.metric_at_risk)
  add('Kind of harm', f.impact_type ? HARM[f.impact_type] ?? words(f.impact_type) : null)
  add('Who feels it', (f.affects ?? []).map((a) => WHO[a] ?? words(a)).join(', '))
  add('When it bites', f.time_horizon ? HORIZON[f.time_horizon] ?? words(f.time_horizon) : null)
  add('Confidence', f.confidence ? words(f.confidence) : null)
  add('Markets', (f.markets ?? []).join(', '))
  // "Open" is the absence of news. Only a status that says something prints.
  add('Status', f.status && f.status !== 'open' ? words(f.status) : null)
  add('Client decision', f.decision ? words(f.decision) : null)
  return cells.length ? `<div class="facts" data-keep>${cells.join('')}</div>` : ''
}

/**
 * Compact mode holds a finding to one page. When it carries more than fits,
 * something has to come off, and the layout pass removes the least important
 * thing first. Each item is marked here with how soon it can go: a higher
 * number goes sooner. Extra exhibits go first, then measurements past the
 * third, then steps past the fourth, and only then the things a reader would
 * miss. The first measurement and the first step are never marked, so they
 * always print. Whatever comes off is counted on the page.
 */
const droppable = (html: string, order: number | null, kind: string) =>
  order == null ? html : html.replace(/^(\s*<\w+)/, `$1 data-drop="${order}" data-kind="${kind}"`)

/** Long extracts are the one thing that cannot be divided between pages. */
function clampExtract(text: string, max: number): string {
  const lines = String(text ?? '').split('\n')
  if (lines.length <= max) return esc(text)
  const rest = lines.length - max
  return esc(lines.slice(0, max).join('\n')) +
    `\n<span class="clip">${count(rest, 'more line')} in the full record</span>`
}

/**
 * One exhibit. It shows whatever it has: a screenshot, an extract, or neither,
 * in which case it is a reference line with its caption and its address.
 */
function figure(e: Example, n: number, images: Record<string, string>): string {
  const src = e.image_path
    ? images[e.image_path] ?? (/^https?:\/\//i.test(e.image_path) ? e.image_path : null)
    : null
  const body = src
    ? `<div class="figimg"><img src="${esc(src)}" alt=""></div>`
    : (e.kind === 'markup' || e.kind === 'response') && has(e.extract)
      ? `<div class="code">${clampExtract(e.extract ?? '', 28)}</div>`
      : ''
  const meta = [
    has(e.query) ? `Query: ${esc(e.query)}` : '',
    has(e.surface) ? esc(e.surface) : '',
    has(e.request) ? esc(e.request) : '',
    has(e.selector) ? esc(e.selector) : '',
    has(e.url) ? rich(e.url) : '',
    e.redacted ? 'Redacted before inclusion' : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')
  const caption = has(e.caption) ? e.caption : has(e.label) ? e.label : words(e.kind)
  return `<figure class="evfig${body ? (src ? ' img' : ' wide') : ' ref'}">${body}<figcaption class="evcap"><span class="n">${n}</span>
    <span class="t">${esc(caption)}</span>
    ${has(e.captured) ? `<span class="m">${esc(day(e.captured))}</span>` : ''}</figcaption>
    ${meta ? `<div class="evmeta">${meta}</div>` : ''}</figure>`
}

function findingPage(
  f: FindingFull, running: string, folio: number, images: Record<string, string>,
  refOf: Map<string, string>, sheetUrl?: string | null, compact = false,
): string {
  const drop = (html: string, order: number | null, kind: string) =>
    compact ? droppable(html, order, kind) : html
  const title = has(f.title) ? f.title : 'Untitled finding'

  const head = `<div class="hd" data-keep>
    ${f.band ? `<span class="tag ${SEV[f.band]}">${esc(f.band)}</span>` : ''}
    <span class="idl">${esc(f.ref)}</span><span class="sp"></span>
    ${has(f.raised) ? `<span class="idl">Found ${esc(day(f.raised))}</span>` : ''}</div>
    <h1 class="ttl" data-keep>${esc(title)}</h1>`

  const why = splitBlk('Why it matters', paras(f.impact_basis), '<div data-items>%s</div>')

  const checks = (f.measurements ?? []).filter((m) => has(m.check) || has(m.result))
  // The tool column exists only if some row names a tool or a date.
  const anyTool = checks.some((m) => has(m.tool) || has(m.taken))
  const rows = checks
    .map((m, i) => {
      const tool = [m.tool, m.taken ? day(m.taken) : ''].filter(has).join(' · ')
      return drop(`<tr><td class="ck">${esc(m.check)}</td><td class="rs">${esc(m.result)}</td>
        ${anyTool ? `<td class="tool">${esc(tool)}</td>` : ''}</tr>`,
      i === 0 ? null : i < 3 ? 80 + i : 200 + i, 'measurement')
    })
  // When it was gathered rides on the label, where it costs no line.
  const window = has(f.collected_from) && has(f.collected_to)
    ? f.collected_from === f.collected_to
      ? `gathered ${day(f.collected_from)}`
      : `gathered ${day(f.collected_from)} to ${day(f.collected_to)}`
    : ''
  const evidence = splitBlk(`The evidence${window ? `, ${window}` : ''}`, rows,
    '<table class="ev"><tbody data-items>%s</tbody></table>')

  const behind = [
    has(f.confidence_reason)
      ? drop(`<p class="note"><b>${f.confidence ? `Confidence is ${esc(f.confidence)}.` : 'On confidence.'}</b> ${rich(f.confidence_reason)}</p>`, 50, 'note') : '',
  ].filter(Boolean).join('')

  const figs = (f.examples ?? []).map((e, i) => drop(figure(e, i + 1, images), i === 0 ? 90 : 300 + i, 'exhibit'))
  // Four or more screenshots go two to a row. Full width, six of them are
  // three pages of pictures between the evidence and the fix.
  const shots = (f.examples ?? []).filter((e) => e.image_path).length
  const exhibits = splitBlk(count(figs.length, 'Exhibit'), figs,
    `<div class="figs${shots >= 4 ? ' two' : ''}" data-items data-total="${figs.length}" data-noun="exhibit">%s</div>`)

  const steps = (f.steps ?? []).filter(has)
    .map((st, i) => drop(`<li><span class="sn">${i + 1}</span>${rich(st)}</li>`,
      i === 0 ? null : i < 4 ? 60 + i : 100 + i, 'step'))
  const lead = has(f.action) ? `<p class="fixlead">${rich(f.action)}</p>` : ''
  const fix = splitBlk('The fix', steps, '<ol class="steps" data-items>%s</ol>', 'fix', lead)

  const waits = [
    (f.depends_on ?? []).length
      ? `<p class="note"><b>Has to follow</b> ${esc((f.depends_on ?? []).map((id) => refOf.get(id) ?? '').filter(Boolean).join(', '))}</p>` : '',
    (f.external_blockers ?? []).length
      ? `<p class="note"><b>Waiting on</b> ${esc((f.external_blockers ?? []).join('; '))}</p>` : '',
  ].filter((s) => s && !/<\/b> <\/p>$/.test(s)).join('')

  const proof = blk('How we will know it worked',
    paras(f.verification_method).join('') +
    (has(f.verification_method) && has(f.verify_by) ? `<p class="note">Check again by ${esc(day(f.verify_by))}.</p>` : ''))

  // After delivery. Each line prints only if that thing has happened.
  const since = [
    has(f.decision_note) ? `<p class="body"><b>${f.decision ? `${words(f.decision)} by the client.` : 'From the client.'}</b> ${rich(f.decision_note)}</p>` : '',
    has(f.implemented_on) ? `<p class="body">Reported live on ${esc(day(f.implemented_on))}.</p>` : '',
    has(f.verified_on) ? `<p class="body">Confirmed fixed on ${esc(day(f.verified_on))}.</p>` : '',
    has(f.closed_note) ? `<p class="body">${rich(f.closed_note)}</p>` : '',
    has(f.outcome_value) || has(f.outcome_note)
      ? `<p class="body"><b>Outcome${has(f.outcome_measured_on) ? `, measured ${esc(day(f.outcome_measured_on))}` : ''}.</b> ${
        has(f.outcome_value) ? `${Number(f.outcome_value).toLocaleString('en-US')} ${esc(f.outcome_unit ?? '')}. ` : ''}${rich(f.outcome_note ?? '')}</p>` : '',
  ].filter(Boolean).join('')

  const record = sheetUrl
    ? `<p class="record">Every field of this finding is in <a href="${esc(sheetUrl)}">the register</a>.</p>`
    : ''

  const inner = head + facts(f) + why + evidence +
    (behind ? `<section class="blk tight">${behind}</section>` : '') +
    exhibits + fix +
    (waits ? `<section class="blk tight">${waits}</section>` : '') +
    proof + blk('What has happened since', since) +
    (compact ? '<p class="note dropnote" hidden></p>' : '') + record

  return pageOf({ kind: compact ? 'finding-compact' : 'finding', label: 'Findings', cont: title, ref: f.ref, fid: f.id },
    inner, running, folio)
}

/* ------------------------------------------------------------ front matter */

const PILLAR_OF = (f: FindingFull) => categoryOf(f.pillar)
const SUB_OF = (f: FindingFull) => (isCategoryPath(f.pillar) ? f.pillar.split('/')[1] : '')

/** What we found: the shape of the audit before any of the detail. */
function summaryPage(findings: FindingFull[], running: string, folio: number): string {
  const n = findings.length
  const scored = findings.filter((f) => f.score != null)
  const sized = findings.filter((f) => f.effort_days != null)
  const effort = sized.reduce((t, f) => t + Number(f.effort_days), 0)

  // The headline says only what the audit knows. "0 engineering days" on an
  // audit nobody has sized reads as a claim that the work is free.
  const headline = count(n, 'finding') + (
    sized.length === 0 ? ''
      : sized.length === n ? `, ${count(effort, 'engineering day')} of work`
        : `, ${count(effort, 'engineering day')} across the ${sized.length} sized so far`)

  let bands = ''
  if (scored.length) {
    const c: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 }
    for (const f of scored) if (f.band) c[f.band]++
    const tiles = (['P1', 'P2', 'P3', 'P4'] as const)
      .map((b) => `<div class="sumband"><b>${c[b]}</b><span>${b}, ${esc(BAND_LABEL[b].toLowerCase())}</span></div>`)
    if (scored.length < n) tiles.push(`<div class="sumband"><b>${n - scored.length}</b><span>Not yet scored</span></div>`)
    bands = `<section class="blk"><div class="sumbands">${tiles.join('')}</div></section>`
  }

  // Category, with what sits under it. A bare "Experience 7" hides that four
  // of them are one kind of problem.
  const cats = new Map<string, Map<string, number>>()
  for (const f of findings) {
    const c = PILLAR_OF(f)
    if (!cats.has(c)) cats.set(c, new Map())
    const s = SUB_OF(f)
    cats.get(c)!.set(s, (cats.get(c)!.get(s) ?? 0) + 1)
  }
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
  const catRows = [...cats.entries()].sort((a, b) => total(b[1]) - total(a[1])).map(([c, subs]) => {
    const detail = [...subs.entries()].filter(([s]) => s).sort((a, b) => b[1] - a[1])
      .map(([s, k]) => `${esc(s)} ${k}`).join(', ')
    return `<tr><td>${esc(c)}</td><td>${detail}</td><td class="num">${total(subs)}</td></tr>`
  })

  const tally = (pick: (f: FindingFull) => string | null | undefined) => {
    const m = new Map<string, { n: number; days: number }>()
    for (const f of findings) {
      const k = pick(f)
      if (!has(k)) continue
      const e = m.get(k as string) ?? { n: 0, days: 0 }
      e.n++; e.days += Number(f.effort_days ?? 0)
      m.set(k as string, e)
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }
  // A tally is a summary. Past five lines it is the list again, and it pushes
  // the page it is summarising onto a second sheet, so the tail is counted.
  const capped = (rows: [string, { n: number; days: number }][], line: (k: string, e: { n: number; days: number }) => string) => {
    if (rows.length <= 6) return rows.map(([k, e]) => line(k, e))
    const rest = rows.slice(5)
    const sum = rest.reduce((a, [, e]) => ({ n: a.n + e.n, days: a.days + e.days }), { n: 0, days: 0 })
    return [...rows.slice(0, 5).map(([k, e]) => line(k, e)), line(`${rest.length} others`, sum)]
  }
  const owners = tally((f) => f.owner)
  const ownerRows = capped(owners, (o, e) =>
    `<tr><td>${esc(o)}</td><td class="num">${count(e.n, 'finding')}${e.days ? ` &nbsp;·&nbsp; ${count(e.days, 'day')}` : ''}</td></tr>`)
  const unowned = n - owners.reduce((t, [, e]) => t + e.n, 0)
  if (ownerRows.length && unowned) ownerRows.push(`<tr><td>No owner yet</td><td class="num">${count(unowned, 'finding')}</td></tr>`)
  // One owner named across fourteen findings is not a picture of who owns the
  // work. The table waits until most of it has somebody's name on it.
  const showOwners = unowned <= n / 2

  const metricRows = capped(tally((f) => f.metric_at_risk), (m, e) =>
    `<tr><td>${esc(m)}</td><td class="num">${count(e.n, 'finding')}</td></tr>`)

  const top = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5).map((f) =>
    `<tr><td class="dt">${esc(f.ref)}</td><td>${esc(f.title)}</td><td class="num">${f.score}</td></tr>`)

  const table = (cls: string) => `<table class="ev ${cls}"><tbody data-items>%s</tbody></table>`
  // The two tallies sit side by side when both exist. Stacked, they are what
  // pushed a full audit's summary onto a second sheet.
  const owned = showOwners ? ownerRows : []
  const half = (label: string, rows: string[]) =>
    `<div><div class="sect">${label}</div><table class="ev"><tbody>${rows.join('')}</tbody></table></div>`
  const tallies = metricRows.length && owned.length
    ? `<section class="blk duo">${half('What is at risk', metricRows)}${half('Who owns the work', owned)}</section>`
    : splitBlk('What is at risk', metricRows, table('tbl-metric')) + splitBlk('Who owns the work', owned, table('tbl-own'))
  const inner = `<div class="sect" data-keep>What we found</div><h1 class="ttl" data-keep>${esc(headline)}</h1>` +
    bands +
    splitBlk('Where they sit', catRows, table('tbl-cat')) +
    splitBlk('Highest scoring', top, table('tbl-top')) +
    tallies

  return pageOf({ kind: 'summary', label: 'Summary', cont: 'What we found' }, inner, running, folio)
}

/** How the audit was done, and what it could not see. */
function methodPage(audit: Audit, anyScored: boolean, running: string, folio: number): string {
  const src = (audit.sources ?? []).filter((s) => has(s?.tool))
  const withWindow = src.some((s) => has(s.window))
  const withConf = src.some((s) => has(s.confidence))
  const sources = src.map((s) => `<tr><td>${esc(s.tool)}</td>
      ${withWindow ? `<td class="num">${esc(/^\d{4}-\d{2}-\d{2}$/.test(s.window ?? '') ? day(s.window) : s.window ?? '')}</td>` : ''}
      ${withConf ? `<td class="num">${esc(words(s.confidence))}</td>` : ''}</tr>`)
  const srcHead = withWindow || withConf
    ? `<thead><tr><th>Source</th>${withWindow ? '<th style="text-align:right">Window</th>' : ''}${withConf ? '<th style="text-align:right">Confidence</th>' : ''}</tr></thead>`
    : ''

  // The scoring explainer belongs in a document that has scores in it. In one
  // that does not, it is a page of method for a number the reader never sees.
  const priority = anyScored ? blk('How priority is worked out', `
    <p class="body">Every finding is scored the same way, so the ordering is arithmetic
      rather than opinion. Effort sits under a square root deliberately: dividing by it
      outright would make the register recommend nothing but trivia.</p>
    <div class="formula">score = 3 &times; (severity &times; reach &times; confidence &times; leverage)
      &divide; sqrt(effort) &times; risk factor, capped at 100</div>
    <p class="body">The band is a position inside this audit rather than a fixed number:
      P1 is the most urgent work here, not a score above some threshold. Two findings that
      score the same always share a band.</p>
    <table class="ev tbl-band" style="margin-top:3mm"><tbody>
      <tr><td class="dt">P1</td><td>Top 15%</td><td>Do this first</td></tr>
      <tr><td class="dt">P2</td><td>Next 25%</td><td>Scheduled work</td></tr>
      <tr><td class="dt">P3</td><td>Next 30%</td><td>Do alongside</td></tr>
      <tr><td class="dt">P4</td><td>The rest</td><td>Monitor</td></tr>
    </tbody></table>`) : ''

  const said =
    splitBlk('What was examined', paras(audit.scope_note), '<div data-items>%s</div>') +
    splitBlk('What it was built from', sources, `<table class="ev tbl-src">${srcHead}<tbody data-items>%s</tbody></table>`) +
    splitBlk('What it could not see', paras(audit.gaps), '<div data-items>%s</div>') +
    priority
  // An audit that declared no scope, no sources and no gaps, and scored
  // nothing, has no method to print. A heading over an empty page is worse
  // than no page.
  if (!said) return ''
  const inner = `<div class="sect" data-keep>Method and scope</div><h1 class="ttl" data-keep>How this was done</h1>` + said

  return pageOf({ kind: 'method', label: 'Method', cont: 'How this was done' }, inner, running, folio)
}

/**
 * The work, in order. Grouped into waves when findings have been scheduled,
 * and a plain ordered list when they have not: a roadmap with one group
 * called "Unscheduled" and a column of blanks is not a roadmap.
 */
function roadmapPage(findings: FindingFull[], running: string, folio: number): string {
  const anyWave = findings.some((f) => f.wave != null)
  const anyOwner = findings.some((f) => has(f.owner))
  const sized = findings.filter((f) => f.effort_days != null)
  const total = sized.reduce((n, f) => n + Number(f.effort_days), 0)

  const row = (f: FindingFull) => `<tr>
      <td class="dt">${esc(f.ref)}</td>
      <td class="sub">${esc(has(f.action) ? f.action : f.title)}</td>
      ${anyOwner ? `<td class="own">${esc(f.owner ?? '')}</td>` : ''}
      ${sized.length ? `<td class="num">${f.effort_days != null ? count(Number(f.effort_days), 'day') : ''}</td>` : ''}
    </tr>`
  // Fixed columns, so the references line up from one wave's table to the next.
  const table = `<table class="ev tbl-road"><colgroup><col class="c-ref"><col>${anyOwner ? '<col class="c-own">' : ''}${
    sized.length ? '<col class="c-eff">' : ''}</colgroup><tbody data-items>%s</tbody></table>`

  let blocks: string
  if (anyWave) {
    const waves = new Map<number, FindingFull[]>()
    for (const f of findings) {
      const w = f.wave ?? 99
      if (!waves.has(w)) waves.set(w, [])
      waves.get(w)!.push(f)
    }
    blocks = [...waves.entries()].sort((a, b) => a[0] - b[0]).map(([w, items]) => {
      const days = items.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)
      const hd = `<div class="wavehd"><span>${w === 99 ? 'Not yet scheduled' : `Wave ${w}`}</span>
        <span class="dt">${count(items.length, 'finding')}${days ? ` &nbsp;·&nbsp; ${count(days, 'day')}` : ''}</span></div>`
      return `<section class="blk" data-split>${hd}${table.replace('%s', items.map(row).join(''))}</section>`
    }).join('')
  } else {
    blocks = `<section class="blk" data-split>${table.replace('%s', findings.map(row).join(''))}</section>`
  }

  const waveCount = new Set(findings.filter((f) => f.wave != null).map((f) => f.wave)).size
  const headline = sized.length
    ? count(total, 'engineering day') + (anyWave ? `, in ${count(waveCount, 'wave')}` : '')
      + (sized.length < findings.length ? `, with ${findings.length - sized.length} still to size` : '')
    : `${count(findings.length, 'fix', 'fixes')}, in order`

  const inner = `<div class="sect" data-keep>${anyWave ? 'Roadmap' : 'The work'}</div>
    <h1 class="ttl" data-keep>${esc(headline)}</h1>${blocks}`
  return pageOf({ kind: 'roadmap', label: anyWave ? 'Roadmap' : 'The work', cont: anyWave ? 'Roadmap' : 'The work' }, inner, running, folio)
}

/** For a client who has not had one of these before. Only the parts this
 *  document actually has are explained. */
function appendixPage(findings: FindingFull[], running: string, folio: number): string {
  const some = (p: (f: FindingFull) => unknown) => findings.some((f) => has(p(f)))
  const rows: [string, string][] = [
    ['The title', 'Stated as a claim, so it is something you can agree or disagree with rather than a topic.'],
  ]
  if (some((f) => f.impact_basis)) rows.push(['Why it matters', 'What the problem costs, and where any number in it came from.'])
  if (some((f) => f.measurements)) rows.push(['The evidence', 'Each check that was run and what it returned, with the tool it came from. Every claim in the document traces back to one of these rows.'])
  if (some((f) => f.examples)) rows.push(['The exhibits', 'The problem shown in place, so you do not have to go looking for it.'])
  if (some((f) => f.score)) rows.push(['Priority', 'Built from severity, how much of the site is affected, how strong the evidence is, how much other work it unblocks, the effort, and the risk of the fix itself. Not a typed opinion.'])
  if (some((f) => f.effort_days)) rows.push(['Effort', 'Engineering days, estimated. It feeds the priority, which is why a cheap fix can outrank a more serious problem that takes a quarter.'])
  if (some((f) => f.action) || some((f) => f.steps)) rows.push(['The fix', 'What to do, written as an instruction to the team that can do it, in steps that need no follow-up question.'])
  if (some((f) => f.verification_method)) rows.push(['How we will know it worked', 'The check that proves the fix. It was written before the fix, so it is a real test rather than one chosen to pass.'])

  const inner = `<div class="sect" data-keep>How to read this</div>
    <h1 class="ttl" data-keep>What each part of a finding page is telling you</h1>
    <section class="blk" data-split><table class="ev tbl-read"><tbody data-items>${
      rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
    <section class="blk"><p class="body">If a finding says something you know to be wrong, say so. The record is
      built to be argued with, and a corrected finding is worth more than a polite one.</p></section>`
  return pageOf({ kind: 'appendix', label: 'How to read this', cont: 'How to read this' }, inner, running, folio)
}

/* -------------------------------------------------------------- document */

export function buildPrintDocument(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
  byline: string,
  /** Signed URL for the brand logo. Resolved by the caller, because the
   *  bucket is private and this function is pure. */
  logoUrl?: string | null,
  /** The register this document is the argument for. Linked from each finding,
   *  so "the rest is in the sheet" is a link rather than a claim. */
  sheetUrl?: string | null,
  /** Exhibit image paths mapped to addresses a browser can load. Resolved by
   *  the caller for the same reason as the logo. */
  images: Record<string, string> = {},
): string {
  // exposure exists so a finding can stay in the register without reaching the
  // client. Scored findings lead, highest first; the rest keep the order they
  // were written in, which is the author's own order of importance.
  const ordered = clientFindings(findings).sort((a, b) =>
    ((b.score ?? -1) - (a.score ?? -1)) || ((a.position ?? 0) - (b.position ?? 0)))
  const scored = ordered.filter((f) => f.score != null)
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 } as Record<string, number>
  for (const f of ordered) if (f.band) counts[f.band]++
  const refOf = new Map(findings.map((f) => [f.id, f.ref]))
  // One page per finding, chosen in the export dialog. Off, a long finding
  // runs onto a second page and nothing is left out.
  const compact = (audit as unknown as { doc_compact?: boolean }).doc_compact === true
  const running = `${brand.name} / ${audit.title}`

  const id = identityOf(brand)
  const pal = reportPalette(id)
  // The accent sets every section label and link, which are small type on
  // white. A pale accent (a yellow, a light orange) is fine as a fill and
  // unreadable as 7pt text, so for text it is darkened until it can be read.
  let accentText = pal.accent
  for (let i = 0; i < 12 && contrast(accentText, '#FFFFFF') < 4.5; i++) accentText = shade(accentText, -0.12)

  // The brand's own colours and faces, injected as variables the print
  // stylesheet already reads. A pale brand colour would make white cover text
  // unreadable, so what goes on top is decided by contrast, not assumed.
  const brandCss = `<style>
    @import url('${fontHref(id)}');
    :root{
      --brand:${pal.primary}; --brand-on:${pal.onPrimary}; --brand-ink:${pal.ink};
      --brand-accent:${accentText}; --brand-wash:${pal.wash}; --brand-rule:${pal.rule};
      --disp:'${id.type.display}',Georgia,serif; --body:'${id.type.body}',Arial,sans-serif;
      --teal-d:${accentText};
    }
    .cover{background:${pal.primary};color:${pal.onPrimary}}
    .cover .chip{background:transparent;border:1px solid ${pal.onPrimary};color:${pal.onPrimary}}
    .cover .cvtitle,.cover .cvsub,.cover .cvstats b,.cover .cvstats span,.cover .cvfoot{color:${pal.onPrimary}}
    .cover .cvstats{border-top:1px solid ${pal.onPrimary}55;border-bottom:1px solid ${pal.onPrimary}55}
    .cvlogo{max-height:16mm;max-width:70mm;margin-bottom:auto}
    .cvslogan{font-family:var(--disp);font-size:13pt;font-weight:500;opacity:.85;margin:3mm 0 0}
    .cvcontact{font-family:var(--mono);font-size:7.6pt;letter-spacing:.1em;text-transform:uppercase;
      opacity:.75;margin:7mm 0 0}
  </style>`

  const logo = logoUrl
    ? `<img class="cvlogo" src="${esc(logoUrl)}" alt="${esc(brand.name)}">`
    : '<div class="cvlogo"></div>'

  const contact = id.contact.name
    ? `<p class="cvcontact">Prepared for ${esc(id.contact.name)}${id.contact.role ? `, ${esc(id.contact.role)}` : ''}</p>`
    : ''

  // Four numbers at most, and every one of them a real count. On a scored
  // audit they are the bands; on an unscored one a row of zeros would say the
  // audit found nothing urgent, which it did not say.
  const exhibits = ordered.reduce((n, f) => n + (f.examples ?? []).length, 0)
  const cats = new Set(ordered.map(PILLAR_OF)).size
  const stats: [string, string][] = [[String(ordered.length), ordered.length === 1 ? 'Finding' : 'Findings']]
  if (scored.length) {
    stats.push([String(counts.P1), 'P1, do first'], [String(counts.P2), 'P2, scheduled'])
  } else {
    if (cats > 1) stats.push([String(cats), 'Areas covered'])
    if (exhibits) stats.push([String(exhibits), exhibits === 1 ? 'Exhibit' : 'Exhibits'])
  }
  if (audit.urls_crawled != null) {
    stats.push([audit.urls_crawled.toLocaleString('en-US'), audit.urls_crawled === 1 ? 'Page reviewed' : 'URLs crawled'])
  }

  const cover = `${brandCss}<div class="page" data-kind="cover"><div class="pg cover">
    ${logo}
    <div class="chip">${esc(kindOf(audit))}</div>
    <h1 class="cvtitle">${esc(audit.title)}</h1>
    <p class="cvsub">${esc(id.legal_name ?? brand.name)}${brand.domain ? ` &nbsp;·&nbsp; ${esc(brand.domain)}` : ''}</p>
    ${id.slogan ? `<p class="cvslogan">${esc(id.slogan)}</p>` : ''}
    <div class="cvstats">${stats.slice(0, 4).map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    ${contact}
    <div class="cvfoot"><span>${esc(byline)}</span><span>${esc(day(audit.delivered_on ?? new Date().toISOString().slice(0, 10)))}</span></div>
  </div></div>`

  // Which sheet each section starts on, counted off the sections that are
  // actually in the document, in the order they actually appear. This is the
  // count before layout. A page that runs long adds a sheet, so the layout
  // pass renumbers every foot and the contents once it knows the real order.
  // A section with nothing to say is left out even when it is ticked: the
  // pages about findings when there are none, the method page when the audit
  // declared no method.
  const any = ordered.length > 0
  const methodHtml = methodPage(audit, scored.length > 0, running, 0)
  const sheets: Record<SectionKey, number> = {
    cover: 1, summary: any ? 1 : 0, contents: any ? 1 : 0, method: methodHtml ? 1 : 0,
    findings: ordered.length, roadmap: any ? 1 : 0, appendix: any ? 1 : 0,
  }
  const chosen = sectionsOf(audit).filter((s) => s.on && sheets[s.key] > 0)
  const startOf = {} as Record<SectionKey, number>
  let at = 1
  for (const s of chosen) { startOf[s.key] = at; at += sheets[s.key] ?? 1 }
  const findingsOn = startOf.findings != null

  const index = (folio: number) => {
    const rows = ordered.map((f, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td class="t">${esc(has(f.title) ? f.title : 'Untitled finding')}<span class="r">${esc(f.ref)}</span></td>
        ${scored.length ? `<td class="b">${esc(f.band ?? '')}</td><td class="s">${f.score ?? ''}</td>` : ''}
        ${findingsOn ? `<td class="p" data-pageof="${esc(f.id)}">${startOf.findings + i}</td>` : ''}
      </tr>`)
    const inner = `<div class="sect" data-keep>Contents</div>
      <h1 class="ttl" data-keep>${scored.length ? 'Findings, in priority order' : 'The findings'}</h1>
      <section class="blk" data-split><table class="idx"><thead><tr><th></th><th>Finding</th>
        ${scored.length ? '<th class="r">Band</th><th class="r">Score</th>' : ''}${findingsOn ? '<th class="r">Page</th>' : ''}
        </tr></thead><tbody data-items>${rows.join('')}</tbody></table></section>`
    return pageOf({ kind: 'contents', label: 'Contents', cont: 'Contents' }, inner, running, folio)
  }

  const built: Record<SectionKey, (folio: number) => string> = {
    cover: () => cover,
    summary: (folio) => summaryPage(ordered, running, folio),
    contents: (folio) => index(folio),
    method: (folio) => methodPage(audit, scored.length > 0, running, folio),
    findings: (folio) =>
      ordered.map((f, i) => findingPage(f, running, folio + i, images, refOf, sheetUrl, compact)).join(''),
    roadmap: (folio) => roadmapPage(ordered, running, folio),
    appendix: (folio) => appendixPage(ordered, running, folio),
  }

  // The cover carries the brand variables, so when it is switched off the
  // style block still has to lead or the rest of the document loses the kit.
  const body = chosen.map((s) => built[s.key]?.(startOf[s.key]) ?? '').join('')
  return chosen[0]?.key === 'cover' ? body : `${brandCss}${body}`
}

/**
 * Lay the document out once it can be measured.
 *
 * A finding carries however much it carries. The page it starts on takes what
 * fits; the rest moves to a page of its own, headed with the finding it
 * continues. Tables, step lists, exhibits and long prose divide between the
 * two pages row by row; everything else moves whole. Nothing is dropped, and
 * nothing is shrunk past the point of a slightly tight page: if the overflow
 * is under a tenth it is scaled to fit, since a continuation page holding two
 * lines is worse than a page set a fraction smaller.
 *
 * It waits for images first, because an exhibit has no height until its
 * screenshot has loaded, and a page measured before that is measured wrong.
 * An image that fails to load is removed, so its caption still prints and
 * there is no broken frame.
 *
 * Then every foot and the contents are renumbered from the real page order.
 */
export const LAYOUT_SCRIPT = `
(function () {
  var root = document.documentElement;
  if (root.getAttribute('data-fit')) return;
  root.setAttribute('data-fit', 'running');
  var SOFT = 0.82, HARD = 0.62;
  var FIG = ['80mm', '66mm', '54mm', '44mm', '36mm'];

  function availOf(box) {
    var cs = getComputedStyle(box);
    return box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  }
  function scaleTo(flow, avail, floor) {
    var lo = floor, hi = 1, s = floor;
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      flow.style.width = (100 / mid) + '%';
      flow.style.transform = 'scale(' + mid + ')';
      if (flow.scrollHeight * mid <= avail) { s = mid; lo = mid; } else { hi = mid; }
    }
    flow.style.width = (100 / s) + '%';
    flow.style.transform = 'scale(' + s + ')';
  }
  function movable(el) { return !!el && !el.hasAttribute('data-keep'); }
  function itemsOf(el) { return el.hasAttribute('data-split') ? el.querySelector('[data-items]') : null; }

  function pageAfter(page) {
    var next = page.cloneNode(false);
    next.removeAttribute('data-fid');
    var pg = document.createElement('div');
    pg.className = page.querySelector('.pg').className;
    var flow = document.createElement('div');
    flow.className = 'flow';
    var label = page.getAttribute('data-cont');
    if (label) {
      var h = document.createElement('div');
      h.className = 'conthd';
      h.setAttribute('data-keep', '');
      var ref = page.getAttribute('data-contref');
      if (ref) { var r = document.createElement('span'); r.className = 'idl'; r.textContent = ref; h.appendChild(r); }
      var t = document.createElement('span'); t.className = 'ct'; t.textContent = label; h.appendChild(t);
      var c = document.createElement('span'); c.className = 'cc'; c.textContent = 'Continued'; h.appendChild(c);
      flow.appendChild(h);
    }
    pg.appendChild(flow);
    var foot = page.querySelector('.foot');
    if (foot) pg.appendChild(foot.cloneNode(true));
    next.appendChild(pg);
    page.parentNode.insertBefore(next, page.nextSibling);
    return next;
  }

  /* Compact mode. One page, always. Screenshots shrink, the page is scaled a
     little, and if that is not enough the least important items come off one
     at a time, highest data-drop first, until it fits. What came off is
     counted in a note, so nothing disappears silently. */
  function squeeze(page) {
    var box = page.querySelector('.pg');
    var flow = box && box.querySelector('.flow');
    if (!flow) return;
    var avail = availOf(box);
    var FLOOR = 0.82;
    flow.style.transform = ''; flow.style.width = '100%';
    if (flow.scrollHeight <= avail + 1) return;
    if (flow.querySelector('.figimg')) {
      for (var z = 1; z < FIG.length; z++) {
        flow.style.setProperty('--figh', FIG[z]);
        if (flow.scrollHeight <= avail / FLOOR) break;
      }
    }
    var cut = {}, order = [];
    var note = flow.querySelector('.dropnote');
    var say = function () {
      if (!note) return;
      var bits = order.filter(function (k) { return k !== 'note'; }).map(function (k) {
        return cut[k] + ' ' + (cut[k] === 1 ? k : k + 's');
      });
      if (!bits.length) return;
      var said = bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0];
      note.textContent = 'Kept to one page. Not shown here: ' + said + '. The full record has them.';
      // Shown as soon as there is something to say, so the line it takes is
      // part of what the page is measured with.
      note.hidden = false;
    };
    for (var g = 0; g < 200 && flow.scrollHeight > avail / FLOOR; g++) {
      var marked = flow.querySelectorAll('[data-drop]'), worst = null;
      for (var m = 0; m < marked.length; m++) {
        if (!worst || +marked[m].getAttribute('data-drop') > +worst.getAttribute('data-drop')) worst = marked[m];
      }
      if (!worst) break;
      var kind = worst.getAttribute('data-kind') || 'item';
      if (!cut[kind]) { cut[kind] = 0; order.push(kind); }
      cut[kind]++;
      var holder = worst.parentNode;
      holder.removeChild(worst);
      // A block whose last item just went has nothing left to head.
      if (holder.hasAttribute('data-items') && !holder.children.length) {
        var blk = holder.closest('.blk');
        if (blk && !blk.querySelector('[data-once]')) blk.parentNode.removeChild(blk);
        else if (holder.parentNode) holder.parentNode.removeChild(holder.tagName === 'TBODY' ? holder.parentNode : holder);
      } else if (holder.classList.contains('blk') && !holder.children.length) {
        holder.parentNode.removeChild(holder);
      }
      say();
    }
    // Say how many exhibits are showing, when some are not.
    var lists = flow.querySelectorAll('[data-total]');
    for (var l = 0; l < lists.length; l++) {
      var total = +lists[l].getAttribute('data-total'), shown = lists[l].children.length;
      var lab = lists[l].closest('.blk') && lists[l].closest('.blk').querySelector('.sect');
      if (lab && shown < total) lab.textContent = shown + ' of ' + total + ' ' + lists[l].getAttribute('data-noun') + 's';
    }
    // Nothing left to take off and still too long: the prose itself is
    // shortened to a line count that fits, which is at least visible.
    if (flow.scrollHeight > avail / FLOOR) {
      var lines = [12, 9, 7, 5, 4, 3];
      flow.classList.add('clamped');
      for (var c = 0; c < lines.length; c++) {
        flow.style.setProperty('--cl', lines[c]);
        if (flow.scrollHeight <= avail / FLOOR) break;
      }
      // Only claim it if a paragraph really was cut.
      var prose = flow.querySelectorAll('.body, .steps li, .fixlead'), cutText = false;
      for (var q = 0; q < prose.length; q++) if (prose[q].scrollHeight > prose[q].clientHeight + 1) cutText = true;
      if (!cutText) flow.classList.remove('clamped');
      else if (note) {
        note.textContent = (note.hidden ? 'Kept to one page. ' : note.textContent + ' ') + 'Some wording is shortened.';
        note.hidden = false;
      }
    }
    if (flow.scrollHeight > avail + 1) scaleTo(flow, avail, HARD);
  }

  function spill(page) {
    var box = page.querySelector('.pg');
    var flow = box && box.querySelector('.flow');
    if (!flow) return;
    var avail = availOf(box);
    flow.style.transform = ''; flow.style.width = '100%';
    if (flow.scrollHeight <= avail + 1) return;
    // Screenshots give way first. An exhibit set a little smaller keeps a
    // finding on one page; the same exhibit at full size would push the fix
    // onto a page of its own.
    if (flow.querySelector('.figimg')) {
      for (var z = 1; z < FIG.length; z++) {
        flow.style.setProperty('--figh', FIG[z]);
        if (flow.scrollHeight <= avail / SOFT) break;
      }
      if (flow.scrollHeight > avail / SOFT) flow.style.setProperty('--figh', FIG[2]);
    }
    if (flow.scrollHeight <= avail + 1) return;
    if (flow.scrollHeight <= avail / SOFT) { scaleTo(flow, avail, SOFT); return; }

    var nflow = null, head = null;
    var top = function () { return head ? head.nextSibling : nflow.firstChild; };
    for (var g = 0; g < 800 && flow.scrollHeight > avail + 1; g++) {
      var last = flow.lastElementChild;
      if (!movable(last)) break;
      var items = itemsOf(last);
      var canSplit = !!items && items.children.length > 1;
      // The only block left under the heading, and it cannot be divided: it
      // stays, and is scaled below. Moving it would leave a page with nothing
      // on it but a title.
      if (!canSplit && !movable(last.previousElementSibling)) break;
      if (!nflow) {
        nflow = pageAfter(page).querySelector('.flow');
        head = nflow.querySelector('.conthd');
      }
      var first = top();
      var cont = first && first.nodeType === 1 && first.__from === last ? first : null;
      if (canSplit) {
        if (!cont) {
          cont = last.cloneNode(true);
          var ci = itemsOf(cont);
          while (ci.firstChild) ci.removeChild(ci.firstChild);
          var once = cont.querySelectorAll('[data-once]');
          for (var o = 0; o < once.length; o++) once[o].parentNode.removeChild(once[o]);
          var lab = cont.querySelector('.sect');
          if (lab) {
            var base = lab.getAttribute('data-base') || lab.textContent;
            lab.setAttribute('data-base', base);
            lab.textContent = base + ', continued';
          }
          cont.__from = last;
          nflow.insertBefore(cont, first);
        }
        var into = itemsOf(cont);
        into.insertBefore(items.lastElementChild, into.firstChild);
      } else {
        if (cont) {
          // Its last row is going too, so the two halves become one again.
          var back = itemsOf(cont);
          while (back.firstChild) items.appendChild(back.firstChild);
          nflow.removeChild(cont);
        }
        nflow.insertBefore(last, top());
      }
    }
    if (flow.scrollHeight > avail + 1) scaleTo(flow, avail, HARD);
  }

  function layout() {
    for (var p = document.body.firstElementChild; p; p = p.nextElementSibling) {
      if (!p.classList || !p.classList.contains('page')) continue;
      if (p.getAttribute('data-kind') === 'finding-compact') squeeze(p); else spill(p);
    }
    var pages = document.querySelectorAll('.page');
    var at = {};
    for (var i = 0; i < pages.length; i++) {
      var f = pages[i].querySelector('.folio');
      if (f) f.textContent = String(i + 1);
      var fid = pages[i].getAttribute('data-fid');
      if (fid) at[fid] = i + 1;
    }
    var cells = document.querySelectorAll('[data-pageof]');
    for (var k = 0; k < cells.length; k++) {
      var n = at[cells[k].getAttribute('data-pageof')];
      if (n) cells[k].textContent = String(n);
    }
    root.setAttribute('data-pages', String(pages.length));
    root.setAttribute('data-fit', 'done');
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'audit-document-pages', pages: pages.length }, '*');
      }
    } catch (e) {}
  }

  function dead(img) {
    var fig = img.closest ? img.closest('.figimg') : null;
    var gone = fig || img;
    // Without its picture the exhibit is a reference line, and is set as one.
    if (fig && fig.parentNode) fig.parentNode.className = 'evfig ref';
    if (gone.parentNode) gone.parentNode.removeChild(gone);
  }

  var imgs = Array.prototype.slice.call(document.images);
  var left = 0, started = false;
  var go = function () { if (started) return; started = true; try { layout(); } catch (e) { root.setAttribute('data-fit', 'failed'); } };
  imgs.forEach(function (img) {
    if (img.complete) { if (!img.naturalWidth) dead(img); return; }
    left++;
    var settle = function (ev) {
      if (ev.type === 'error') dead(img);
      if (--left === 0) go();
    };
    img.addEventListener('load', settle);
    img.addEventListener('error', settle);
  });
  if (!left) go(); else setTimeout(go, 15000);
})();
`

/** Kept under its old name for anything still importing it. */
export const FIT_SCRIPT = LAYOUT_SCRIPT

const FONTS = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap'

/**
 * The same document, as one self contained file.
 *
 * The print window, the headless renderer and the preview in the export
 * dialog all load exactly this, layout pass included, so the stored PDF, the
 * printed one and the one on screen are the same artifact rather than three
 * renderings that drift apart.
 */
export function buildStandaloneDocument(html: string, css: string, title: string, extraCss = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${css}${extraCss}</style></head><body>${html}
<script>(function(){
  var run = function () { try { ${LAYOUT_SCRIPT} } catch (e) {
    document.documentElement.setAttribute('data-fit','failed');
  } };
  // Measure after the faces have loaded. Laying out against fallback metrics
  // gives page breaks that are wrong for the document that actually prints.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ setTimeout(run, 120) });
  else setTimeout(run, 600);
})();<\/script></body></html>`
}

/** Opens a print window containing only the document, lays it out, prints. */
export function printDocument(html: string, css: string, title: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) {
    alert('Your browser blocked the print window. Allow popups for this site and try again.')
    return
  }
  w.document.write(buildStandaloneDocument(html, css, title))
  w.document.close()
  w.focus()
  // Print once the layout pass says it has finished, or after a wait long
  // enough that printing something beats printing nothing.
  const started = Date.now()
  const wait = () => {
    const state = w.document.documentElement.getAttribute('data-fit')
    if (state === 'done' || state === 'failed' || Date.now() - started > 20000) setTimeout(() => w.print(), 150)
    else setTimeout(wait, 150)
  }
  wait()
}
