import type { Audit } from './types'

/**
 * What the cover calls this document.
 *
 * This used to be the string "Technical SEO Audit", hardcoded on the cover and
 * copied into two previews. It was wrong more often than it was right: the
 * pillars in a brand registry routinely cover content, merchandising and
 * interaction design, and a record of those is not a technical audit. A label
 * the author cannot change is a label that eventually goes out with a client's
 * name under it.
 */
export const DEFAULT_KIND = 'SEO Audit'

export function kindOf(audit: Audit | null): string {
  const k = audit?.kind?.trim()
  return k ? k : DEFAULT_KIND
}

/** Offered in the UI. The field is free text: this is a starting point, not a
 *  closed set, because the next kind of document is not knowable from here. */
export const KIND_SUGGESTIONS = [
  'SEO Audit',
  'Technical SEO Audit',
  'Page Assessment',
  'Content Audit',
  'Migration Review',
  'Competitive Review',
]
