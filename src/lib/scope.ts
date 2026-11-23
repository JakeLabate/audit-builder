/**
 * Where a finding happens. A finding holds any mix of segments: a template, a
 * component, specific pages, or the whole site. No page counts anywhere: the
 * only number is urls_affected, and it exists only when it can be counted.
 */

export type SegmentType = 'template' | 'component' | 'pages' | 'sitewide'

export interface Segment {
  type: SegmentType
  /** Template or component name, from the brand's lists. */
  name?: string
  /** For a pages segment, the URLs themselves. */
  urls?: string[]
}

export interface UrlList {
  path: string
  count: number
  name: string
  uploaded_at: string
}

export interface Scope {
  segments: Segment[]
  url_list: UrlList | null
}

export const EMPTY_SCOPE: Scope = { segments: [], url_list: null }

export const SEGMENT_LABEL: Record<SegmentType, string> = {
  template: 'Template',
  component: 'Component',
  pages: 'Pages',
  sitewide: 'Sitewide',
}

export function scopeOf(v: unknown): Scope {
  const s = (v ?? {}) as Partial<Scope>
  return {
    segments: Array.isArray(s.segments) ? s.segments : [],
    url_list: s.url_list ?? null,
  }
}

/**
 * Pull URLs out of a pasted list or an uploaded crawl export: one per line,
 * from whichever column holds an http(s) address. Duplicates are removed, and
 * a trailing slash or a fragment does not make two addresses different.
 */
export function parseUrls(text: string): string[] {
  const seen = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/https?:\/\/[^\s,;"'<>]+/i)
    if (!m) continue
    const url = m[0]
    const key = url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
    if (!seen.has(key)) seen.set(key, url)
  }
  return [...seen.values()]
}

const keyOf = (u: string) => u.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()

/**
 * urls_affected, worked out. Known only when every segment can be counted:
 * an uploaded list covers everything, and a scope made only of pages segments
 * counts its own URLs. Anything else is left blank rather than guessed.
 */
export function urlsAffected(scope: Scope, uploaded: string[] | null = null): number | null {
  const listed = scope.segments.filter((s) => s.type === 'pages').flatMap((s) => s.urls ?? [])
  if (scope.url_list) {
    if (!uploaded) return scope.url_list.count
    return new Set([...uploaded, ...listed].map(keyOf)).size
  }
  if (scope.segments.length > 0 && scope.segments.every((s) => s.type === 'pages')) {
    return new Set(listed.map(keyOf)).size
  }
  return null
}

/** The old templates column, kept in step for the portal, the API and exports. */
export function templatesOf(scope: Scope): string[] {
  return [...new Set(scope.segments.filter((s) => s.type === 'template' && s.name).map((s) => s.name as string))]
}

/** One line per segment, for the register and the PDF. */
export function describeScope(scope: Scope): string {
  return scope.segments.map((s) => {
    if (s.type === 'sitewide') return 'Sitewide'
    if (s.type === 'pages') return `Pages: ${(s.urls ?? []).length}`
    return `${SEGMENT_LABEL[s.type]}: ${s.name ?? ''}`
  }).join('; ')
}
