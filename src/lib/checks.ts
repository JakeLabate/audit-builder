import { TAXONOMY } from './taxonomy'
import { DEFAULT_SECTIONS, type SectionChoice } from './sections'

/**
 * Checklists.
 *
 * A check is what an audit sets out to look at. It is not a finding: a check
 * that passes leaves no finding behind, and that is the point. The findings
 * say what is wrong; the checks say what was looked at, so an audit can show
 * what came back clean as well as what did not.
 *
 * Three pieces:
 *   LIBRARY    the universal checks, filed on the same two-level taxonomy as
 *              findings. Shipped in the app, like the taxonomy and the tools.
 *   PRESETS    a named, pre-ticked selection of the library.
 *   templates  a workspace's own saved selection, plus any checks it wrote.
 *
 * A check is written as the healthy state, so Pass means the sentence is true
 * and Fail means it is not. "Redirects resolve in one hop", not "Check
 * redirects".
 *
 * Nothing in this file touches the database. The document builder imports it
 * and is bundled for node by scripts/build-sample.mjs, where there is no
 * Supabase client to load. Reads and writes live in checkdata.ts.
 */

export type CheckStatus = 'todo' | 'pass' | 'fail' | 'na'

/** What a template stores and what an audit copies in. */
export interface CheckSpec {
  /** Library key. Null for a check the workspace wrote. */
  key: string | null
  /** Category/Subcategory from the universal taxonomy. */
  path: string
  title: string
  /** "Tool › Report", the same value a measurement row carries. */
  tool: string | null
  /** What has to be true for it to pass. */
  pass: string | null
}

export interface AuditCheck {
  id: string
  org_id: string
  audit_id: string
  key: string | null
  path: string
  title: string
  tool: string | null
  pass_criteria: string | null
  status: CheckStatus
  note: string | null
  /** The finding a failed check raised. */
  finding_id: string | null
  position: number
  checked_at: string | null
}

export interface AuditTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  checks: CheckSpec[]
  created_at: string
  updated_at: string
}

export const STATUS_LABEL: Record<CheckStatus, string> = {
  todo: 'Not checked',
  pass: 'Passed',
  fail: 'Failed',
  na: 'Not applicable',
}

/* ---------------------------------------------------------------- library */

/** The same "Tool › Report" value tools.ts builds. Not imported from there
 *  because tools.ts loads the Supabase client. Every value here is one of the
 *  universal tools, so the tool picker shows it selected. */
const toolPath = (parent: string, name: string) => `${parent} › ${name}`

const SF = toolPath('Screaming Frog', 'Crawl')
const SF_HREFLANG = toolPath('Screaming Frog', 'Hreflang')
const SF_DUPES = toolPath('Screaming Frog', 'Near duplicates')
const SF_ORPHANS = toolPath('Screaming Frog', 'Orphans')
const GSC_PAGES = toolPath('Search Console', 'Pages')
const GSC_INSPECT = toolPath('Search Console', 'URL Inspection')
const CRUX = toolPath('PageSpeed Insights', 'Field (CrUX)')
const LOGS = toolPath('Server logs', 'Bot requests')
const NETWORK = toolPath('Chrome DevTools', 'Network')
const DOM = toolPath('Chrome DevTools', 'Rendered DOM')
const RICH = toolPath('Rich Results Test', 'Live test')
const VALIDATOR = toolPath('Schema.org Validator', 'Validation')
const BROWSER = toolPath('Manual review', 'Browser')
const SERP = toolPath('Manual review', 'Search results')

type Row = [slug: string, title: string, pass: string, tool: string]

/** The key is the path plus a word. Like the taxonomy, a key is never reused
 *  or renamed once issued: audits and templates point at it. */
const file = (path: string, rows: Row[]): CheckSpec[] =>
  rows.map(([slug, title, pass, tool]) => ({ key: `${path}/${slug}`, path, title, pass, tool }))

export const LIBRARY_VERSION = 1

export const LIBRARY: CheckSpec[] = [
  /* ------------------------------------------------------------ Crawling */
  ...file('Crawling/Robots', [
    ['reachable', 'robots.txt is reachable on every host',
      'Returns 200 with valid directives on each host and protocol variant.', BROWSER],
    ['blocking', 'robots.txt blocks nothing that should be crawled',
      'No disallow rule matches an indexable URL, or a CSS, JavaScript or image file needed to render one.', SF],
    ['ai-crawlers', 'AI crawler access in robots.txt matches the intended policy',
      'GPTBot, ClaudeBot, PerplexityBot and Google-Extended are each allowed or blocked on purpose.', BROWSER],
  ]),
  ...file('Crawling/Sitemaps', [
    ['declared', 'An XML sitemap exists, is declared in robots.txt and is submitted',
      'The sitemap is listed in robots.txt and Search Console fetches it without errors.', SF],
    ['clean', 'Sitemaps list only indexable, canonical URLs that return 200',
      'No redirected, noindexed, canonicalized or error URL in any sitemap.', SF],
    ['complete', 'Every indexable URL is in a sitemap',
      'No indexable URL found in the crawl is missing from the sitemaps.', SF],
  ]),
  ...file('Crawling/Status', [
    ['broken-links', 'Internal links do not point at 4xx pages',
      'No internal link returns a 4xx.', SF],
    ['server-errors', 'The site returns no 5xx errors',
      'No 5xx responses in the crawl, and no server error spike in Crawl stats.', SF],
    ['soft-404', 'Missing pages return a real 404 or 410',
      'A made-up URL returns 404, and Search Console reports no soft 404s.', GSC_PAGES],
  ]),
  ...file('Crawling/Redirects', [
    ['chains', 'Redirects resolve in one hop',
      'No chains or loops: every redirect reaches its final URL in one step.', SF],
    ['internal', 'Internal links point at final URLs, not redirects',
      'No internal link returns a 3xx.', SF],
    ['permanent', 'Permanent moves use 301 or 308',
      'No 302 or 307 on a move that is meant to be permanent.', SF],
    ['variants', 'Protocol and host variants redirect to one canonical version',
      'HTTP, www or non-www and trailing slash variants each 301 to the canonical URL in one hop.', BROWSER],
  ]),
  ...file('Crawling/Waste', [
    ['parameters', 'Parameter and faceted URLs are kept out of the crawl where they add nothing',
      'The only crawlable parameter URLs are ones that are meant to be indexed.', SF],
    ['bot-requests', 'Crawler requests go to pages that matter',
      'Most Googlebot requests in the logs hit indexable URLs that return 200.', LOGS],
  ]),
  ...file('Crawling/Rendering', [
    ['content', 'Main content and links are in the HTML Google renders',
      'Primary content, internal links and metadata are present in the rendered HTML in URL Inspection.', GSC_INSPECT],
    ['raw-vs-rendered', 'Critical tags are the same in raw and rendered HTML',
      'Title, canonical, robots and hreflang do not change after JavaScript runs.', DOM],
  ]),
  ...file('Crawling/Access', [
    ['bots', 'Search and AI crawlers are not blocked by the CDN, firewall or bot protection',
      'Verified crawler requests receive 200, not a challenge page or a 403.', LOGS],
    ['gated', 'Content meant to rank is not behind a login, cookie wall or geo block',
      'Indexable pages return their full content to a logged-out request with no cookies.', BROWSER],
  ]),

  /* ---------------------------------------------------------- Indexation */
  ...file('Indexation/Canonicals', [
    ['self', 'Indexable pages carry a self-referencing canonical',
      'Every indexable URL has exactly one canonical, absolute, pointing at itself.', SF],
    ['targets', 'Canonicals point at indexable URLs that return 200',
      'No canonical targets a redirect, an error, a noindexed URL or a blocked URL.', SF],
    ['google-agrees', 'Google selects the canonical the page declares',
      'URL Inspection shows the declared canonical as the Google-selected one on a sample of each key template.', GSC_INSPECT],
  ]),
  ...file('Indexation/Directives', [
    ['noindex', 'No page that should rank carries noindex',
      'No noindex in meta robots or X-Robots-Tag on a page meant to be indexed.', SF],
    ['conflicts', 'Robots directives do not contradict each other',
      'No page is both blocked in robots.txt and noindexed, and meta robots agrees with X-Robots-Tag.', SF],
    ['staging', 'Staging and test hosts are kept out of the index',
      'Non-production hosts sit behind authentication or noindex, and none appear in a site: search.', SERP],
  ]),
  ...file('Indexation/Duplication', [
    ['near-duplicates', 'There are no exact or near duplicate indexable pages',
      'No cluster of indexable pages above the near duplicate threshold.', SF_DUPES],
    ['url-variants', 'URL variants resolve to one version',
      'Case, trailing slash, parameter order and index file variants redirect or canonicalize to one URL.', SF],
  ]),
  ...file('Indexation/Pagination', [
    ['crawlable', 'Paginated pages are reachable through real links',
      'Page 2 onward is linked with a href links and returns 200.', SF],
    ['canonical', 'Paginated pages canonicalize to themselves',
      'Page 2 onward is indexable with a self canonical, not canonicalized to page 1.', SF],
  ]),
  ...file('Indexation/Coverage', [
    ['indexed-count', 'The indexed page count is in line with the indexable URL count',
      'Pages indexed in Search Console is close to the number of indexable URLs in the crawl.', GSC_PAGES],
    ['excluded', 'Pages excluded in Search Console are excluded on purpose',
      'No important URL sits under Crawled, currently not indexed or Discovered, currently not indexed.', GSC_PAGES],
  ]),

  /* -------------------------------------------------------- Architecture */
  ...file('Architecture/Linking', [
    ['orphans', 'No indexable page is orphaned',
      'Every indexable URL has at least one internal link pointing at it.', SF_ORPHANS],
    ['anchors', 'Internal links are crawlable links with descriptive anchor text',
      'Key links are a href links, not JavaScript handlers, and links to priority pages do not use generic anchors.', SF],
    ['nofollow', 'Internal links are not nofollowed',
      'No rel=nofollow on an internal link to an indexable page.', SF],
  ]),
  ...file('Architecture/Navigation', [
    ['main', 'The main navigation links to every priority section in the HTML',
      'Top-level sections are linked from the navigation in the rendered HTML on mobile and desktop.', DOM],
    ['breadcrumbs', 'Breadcrumbs are present and follow the hierarchy',
      'Every page below the top level shows a breadcrumb trail with linked parents.', BROWSER],
  ]),
  ...file('Architecture/URLs', [
    ['format', 'URLs are lowercase, readable and consistent',
      'No uppercase letters, underscores, spaces or session IDs in indexable URLs.', SF],
  ]),
  ...file('Architecture/Depth', [
    ['click-depth', 'Priority pages sit within three clicks of the home page',
      'No priority page is deeper than three clicks.', SF],
  ]),

  /* ------------------------------------------------------------ Elements */
  ...file('Elements/Titles', [
    ['unique', 'Every indexable page has a unique title',
      'No missing or duplicate titles on indexable pages.', SF],
    ['shown', 'Titles appear in search results as written',
      'Titles on priority pages are not cut off or rewritten in search results.', SERP],
  ]),
  ...file('Elements/Descriptions', [
    ['unique', 'Priority pages have a unique meta description',
      'No missing or duplicate descriptions on priority templates.', SF],
  ]),
  ...file('Elements/Headings', [
    ['h1', 'Every indexable page has one H1 that names the page',
      'No missing or multiple H1s, and the H1 matches what the page is about.', SF],
    ['order', 'Headings follow a logical order',
      'Heading levels are not skipped or chosen for styling on key templates.', DOM],
  ]),
  ...file('Elements/Images', [
    ['alt', 'Meaningful images have alt text',
      'No informative image is missing alt text on key templates.', SF],
    ['crawlable', 'Images are in img tags with a crawlable source',
      'Key images are not CSS backgrounds, and lazy loading does not hide the src from the rendered HTML.', DOM],
    ['sized', 'Images are served at the size they are shown, in a modern format',
      'Key templates serve WebP or AVIF with responsive sizes, and no image far larger than its container.', NETWORK],
  ]),

  /* -------------------------------------------------------------- Schema */
  ...file('Schema/Eligibility', [
    ['types', 'Each template carries the structured data it qualifies for',
      'Product, Article, BreadcrumbList, Organization and other eligible types are present on their templates.', RICH],
  ]),
  ...file('Schema/Errors', [
    ['rich-results', 'Structured data has no rich result errors',
      'No errors in the Rich Results Test or the Search Console enhancement reports, and warnings are reviewed.', RICH],
    ['syntax', 'Structured data parses',
      'Every JSON-LD block is valid JSON and validates against Schema.org.', VALIDATOR],
  ]),
  ...file('Schema/Mismatch', [
    ['visible', 'Structured data matches what the page shows',
      'Price, availability, ratings and dates in the markup equal the visible values.', BROWSER],
  ]),
  ...file('Schema/Entities', [
    ['organization', 'Organization markup identifies the brand and links its profiles',
      'The home page carries Organization with name, logo, url and sameAs.', VALIDATOR],
    ['ids', 'Entities are connected with stable @id references',
      'The same entity uses one @id on every page it appears on.', VALIDATOR],
  ]),

  /* ------------------------------------------------------- International */
  ...file('International/Hreflang', [
    ['reciprocal', 'Hreflang annotations are reciprocal and self-referencing',
      'Every alternate links back, and every page lists itself.', SF_HREFLANG],
    ['codes', 'Hreflang uses valid codes and an x-default',
      'Every value is a valid language or language-region code, and an x-default is set.', SF_HREFLANG],
    ['targets', 'Hreflang points at indexable canonical URLs',
      'No hreflang target redirects, errors, is noindexed or canonicalizes elsewhere.', SF_HREFLANG],
  ]),
  ...file('International/Targeting', [
    ['urls', 'Each market has its own crawlable URL',
      'No market is served only by IP or cookie switching at a single URL.', BROWSER],
    ['geo-redirects', 'No forced geo redirect stops crawlers reaching other markets',
      'Every market URL returns 200 to a request from another country.', BROWSER],
  ]),
  ...file('International/Localization', [
    ['content', "Each market page is in that market's language and currency",
      'Body copy, prices and metadata are localized, not left in the source language.', BROWSER],
  ]),

  /* --------------------------------------------------------- Performance */
  ...file('Performance/Vitals', [
    ['lcp', 'Largest Contentful Paint passes',
      'LCP is 2.5 seconds or less at the 75th percentile in field data, on mobile and desktop.', CRUX],
    ['inp', 'Interaction to Next Paint passes',
      'INP is 200 milliseconds or less at the 75th percentile in field data.', CRUX],
    ['cls', 'Cumulative Layout Shift passes',
      'CLS is 0.1 or less at the 75th percentile in field data.', CRUX],
  ]),
  ...file('Performance/Server', [
    ['ttfb', 'The server responds quickly',
      'Time to first byte is 0.8 seconds or less at the 75th percentile in field data.', CRUX],
    ['caching', 'Static assets are compressed and cached',
      'Text assets are served with Brotli or gzip, and static assets carry a long cache lifetime.', NETWORK],
  ]),
  ...file('Performance/Mobile', [
    ['parity', 'Mobile pages carry the same content, links and markup as desktop',
      'Main content, internal links, metadata and structured data match across mobile and desktop.', DOM],
    ['viewport', 'Pages fit a phone screen',
      'A viewport meta tag is set and no page scrolls sideways at 390 pixels wide.', BROWSER],
  ]),
  ...file('Performance/Security', [
    ['https', 'Every page is served over HTTPS with a valid certificate',
      'No indexable page loads over HTTP, and the certificate is valid on every host.', SF],
    ['mixed-content', 'There is no mixed content',
      'No HTTP resource is loaded on an HTTPS page.', SF],
  ]),
]

const BY_KEY = new Map(LIBRARY.map((c) => [c.key as string, c]))
export const libraryCheck = (key: string | null | undefined) => (key ? BY_KEY.get(key) ?? null : null)

/* ---------------------------------------------------------------- presets */

export interface Preset {
  /** Stored and passed around as preset:<id>. */
  id: string
  name: string
  what: string
  keys: string[]
}

export const PRESETS: Preset[] = [
  {
    id: 'technical',
    name: 'Technical',
    what: 'Whether the site can be crawled, rendered, indexed and understood: crawling, indexation, architecture, on-page elements, structured data, international and performance.',
    keys: LIBRARY.map((c) => c.key as string),
  },
]

export const presetRef = (id: string) => `preset:${id}`

/** The checks behind a starting point: preset:<id>, a template id, or nothing. */
export function specsFor(ref: string | null | undefined, templates: AuditTemplate[]): CheckSpec[] {
  if (!ref) return []
  if (ref.startsWith('preset:')) {
    const p = PRESETS.find((x) => presetRef(x.id) === ref)
    return p ? p.keys.map((k) => BY_KEY.get(k)).filter((c): c is CheckSpec => !!c) : []
  }
  return templates.find((t) => t.id === ref)?.checks ?? []
}

export function nameFor(ref: string | null | undefined, templates: AuditTemplate[]): string | null {
  if (!ref) return null
  if (ref.startsWith('preset:')) return PRESETS.find((x) => presetRef(x.id) === ref)?.name ?? null
  return templates.find((t) => t.id === ref)?.name ?? null
}

/* ------------------------------------------------------------------ shape */

export interface Grouped<T> {
  category: string
  count: number
  subs: { sub: string; path: string; items: T[] }[]
}

/**
 * Anything filed on a path, grouped the way the taxonomy orders it. A path
 * the taxonomy does not know (it should not happen) is kept at the end rather
 * than dropped, because a check that silently vanishes is worse than one in
 * an odd place.
 */
export function groupByPath<T extends { path: string }>(items: T[], everyCategory = false): Grouped<T>[] {
  const out: Grouped<T>[] = []
  const seen = new Set<T>()
  for (const t of TAXONOMY) {
    const subs = t.subcategories.map((s) => {
      const path = `${t.category}/${s}`
      const mine = items.filter((i) => i.path === path)
      mine.forEach((i) => seen.add(i))
      return { sub: s, path, items: mine }
    })
    const count = subs.reduce((n, s) => n + s.items.length, 0)
    if (count || everyCategory) {
      out.push({ category: t.category, count, subs: everyCategory ? subs : subs.filter((s) => s.items.length) })
    }
  }
  const stray = items.filter((i) => !seen.has(i))
  if (stray.length) {
    const paths = [...new Set(stray.map((i) => i.path))]
    out.push({
      category: 'Other', count: stray.length,
      subs: paths.map((p) => ({ sub: p, path: p, items: stray.filter((i) => i.path === p) })),
    })
  }
  return out
}

export interface Coverage {
  total: number
  /** Passed, failed or marked not applicable. */
  checked: number
  pass: number
  fail: number
  na: number
  todo: number
  /** Failed checks that have a finding written for them. */
  findings: number
}

export function coverage(checks: Pick<AuditCheck, 'status' | 'finding_id'>[]): Coverage {
  const c: Coverage = { total: checks.length, checked: 0, pass: 0, fail: 0, na: 0, todo: 0, findings: 0 }
  for (const k of checks) {
    c[k.status]++
    if (k.status !== 'todo') c.checked++
    if (k.status === 'fail' && k.finding_id) c.findings++
  }
  return c
}

/** "42 of 60 checked", and the breakdown that only names what is non-zero. */
export function coverageLine(c: Coverage): string {
  const parts = [
    c.pass ? `${c.pass} passed` : '',
    c.fail ? `${c.fail} failed` : '',
    c.na ? `${c.na} not applicable` : '',
  ].filter(Boolean)
  return `${c.checked} of ${c.total} checked` + (parts.length ? `: ${parts.join(', ')}` : '')
}

/** One identity for a spec, so a tree can tick it and a merge can skip it. */
export const specId = (c: Pick<CheckSpec, 'key' | 'path' | 'title'>) =>
  c.key ?? `own:${c.path}:${c.title.trim().toLowerCase()}`

export const toSpec = (c: AuditCheck): CheckSpec =>
  ({ key: c.key, path: c.path, title: c.title, tool: c.tool, pass: c.pass_criteria })

/**
 * The report sections for an audit that carries a checklist: the defaults,
 * with "What was checked" switched on after the method page. An audit without
 * a checklist never gets the section turned on for it.
 */
export function sectionsWithCoverage(current?: SectionChoice[]): SectionChoice[] {
  const base = (current ?? DEFAULT_SECTIONS).filter((s) => s.key !== 'coverage')
  const at = base.findIndex((s) => s.key === 'method')
  const next = [...base]
  next.splice(at < 0 ? next.length : at + 1, 0, { key: 'coverage', on: true })
  return next
}
