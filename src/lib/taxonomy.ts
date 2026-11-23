/**
 * The universal finding taxonomy. Two levels, the same for every workspace and
 * every brand, and not editable from the app.
 *
 * The words are the IDs. A reference reads Indexation/Canonicals/2, so a word
 * never changes and is never reused once it has been issued. To retire one,
 * leave it here and stop offering it; to add one, append it.
 *
 * Filing rule: file a finding by where the fix lives, not where the symptom
 * shows. A noindex hurting visibility is Indexation/Directives. A robots.txt
 * block on an AI crawler is Crawling/Robots. AI is for fixes made for the
 * answer layer itself.
 */

export const TAXONOMY_VERSION = 1

export const TAXONOMY: { category: string; subcategories: string[] }[] = [
  { category: 'Crawling', subcategories: ['Robots', 'Sitemaps', 'Status', 'Redirects', 'Waste', 'Rendering', 'Access'] },
  { category: 'Indexation', subcategories: ['Canonicals', 'Directives', 'Duplication', 'Pagination', 'Coverage'] },
  { category: 'Architecture', subcategories: ['Linking', 'Navigation', 'URLs', 'Depth'] },
  { category: 'Elements', subcategories: ['Titles', 'Descriptions', 'Headings', 'Images'] },
  { category: 'Content', subcategories: ['Quality', 'Cannibalization', 'Gaps', 'Freshness', 'Trust'] },
  { category: 'Schema', subcategories: ['Eligibility', 'Errors', 'Mismatch', 'Entities'] },
  { category: 'AI', subcategories: ['Extractability', 'Citations', 'Accuracy', 'Agents', 'Feeds'] },
  { category: 'International', subcategories: ['Hreflang', 'Targeting', 'Localization'] },
  { category: 'Local', subcategories: ['Profiles', 'Consistency', 'Pages', 'Reviews'] },
  { category: 'Performance', subcategories: ['Vitals', 'Server', 'Mobile', 'Security'] },
  { category: 'Experience', subcategories: ['Interaction', 'Merchandising', 'Conversion', 'Accessibility', 'Interstitials'] },
  { category: 'Authority', subcategories: ['Backlinks', 'Reclamation', 'Mentions'] },
  { category: 'Operations', subcategories: ['Measurement', 'Monitoring', 'Releases', 'Compliance'] },
].map((c) => ({ ...c, subcategories: [...c.subcategories, 'Other'] }))

/** What a finding carries before anyone has picked a category. */
export const UNCATEGORIZED = 'Uncategorized'

/** Category/Subcategory, the value stored on the finding. */
export function isCategoryPath(v: string | null | undefined): v is string {
  if (!v) return false
  const [c, s, extra] = v.split('/')
  if (extra !== undefined) return false
  return TAXONOMY.some((t) => t.category === c && t.subcategories.includes(s))
}

/** The top level of a path, or the legacy value as it was. */
export function categoryOf(v: string | null | undefined): string {
  if (!v) return UNCATEGORIZED
  return isCategoryPath(v) ? v.split('/')[0] : v
}

/**
 * The next reference for a path in one audit: Category/Subcategory/n, numbered
 * per audit within each subcategory, unpadded. Takes the first free number so
 * a deleted draft finding's number is reused rather than leaving a hole.
 */
export function nextRefFor(path: string | null | undefined, taken: Iterable<string>): string {
  const prefix = isCategoryPath(path) ? path : UNCATEGORIZED
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}/${n}`)) n++
  return `${prefix}/${n}`
}

/** Whether a reference already belongs to this path, so it need not move. */
export function refMatches(ref: string, path: string | null | undefined): boolean {
  const prefix = isCategoryPath(path) ? path : UNCATEGORIZED
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d+$`).test(ref)
}
