import type { AcceptanceCheck, AuditStatus, CheckKind, Example, Finding, Stage } from './types'

/**
 * Where a finding sits after delivery. Mirrors the `stage` column of the
 * `finding_lifecycle` view in Postgres. If you change one, change both.
 */
export function stage(f: Finding, auditStatus: AuditStatus): Stage {
  if (f.outcome_measured_on) return 'measured'
  if (f.status === 'verified') return 'verified'
  if (f.status === 'fixed' || f.implemented_on) return 'implemented'
  if (f.decision) return f.decision
  if (auditStatus === 'delivered' && f.exposure === 'client') return 'delivered'
  if (f.exposure === 'internal') return 'internal'
  return 'drafted'
}

export const STAGE_ORDER: Stage[] = [
  'drafted', 'internal', 'delivered', 'accepted', 'deferred', 'rejected',
  'implemented', 'verified', 'measured',
]

export const STAGE_LABEL: Record<Stage, string> = {
  drafted: 'Drafted',
  internal: 'Internal',
  delivered: 'Delivered',
  accepted: 'Accepted',
  deferred: 'Deferred',
  rejected: 'Rejected',
  implemented: 'Implemented',
  verified: 'Verified',
  measured: 'Measured',
}

/** One sentence per stage, for the editor's lifecycle strip. */
export const STAGE_HELP: Record<Stage, string> = {
  drafted: 'Not yet handed over. The audit is still draft or in review.',
  internal: 'Kept out of the client view. Never counted as an ignored recommendation.',
  delivered: 'Handed over. Waiting on the client to accept, defer or reject.',
  accepted: 'Client said yes. Waiting on implementation.',
  deferred: 'Client parked it. This is the upsell list.',
  rejected: 'Client said no. On the record, with their reason if they gave one.',
  implemented: 'Reported live. The checker has not confirmed it yet.',
  verified: 'The checker confirmed the fix is live.',
  measured: 'An outcome has been recorded against it.',
}

export const CHECK_KINDS: CheckKind[] = [
  'http_status', 'redirect_to', 'header', 'canonical',
  'selector_present', 'selector_absent', 'selector_text',
  'json_ld_type', 'robots_allows', 'robots_disallows',
]

export const CHECK_LABEL: Record<CheckKind, string> = {
  http_status: 'URL returns status',
  redirect_to: 'URL redirects to',
  header: 'Response header contains',
  canonical: 'Canonical points to',
  selector_present: 'Element exists',
  selector_absent: 'Element is gone',
  selector_text: 'Element text contains',
  json_ld_type: 'JSON-LD of @type exists',
  robots_allows: 'robots.txt allows the URL',
  robots_disallows: 'robots.txt blocks the URL',
}

/** Which inputs each kind needs, so the editor shows only those. */
export const CHECK_SHAPE: Record<CheckKind, { selector?: string; expected?: string }> = {
  http_status: { expected: 'Status code, e.g. 200' },
  redirect_to: { expected: 'Final URL' },
  header: { selector: 'Header name', expected: 'Substring of the value' },
  canonical: { expected: 'Expected canonical href' },
  selector_present: { selector: 'CSS selector' },
  selector_absent: { selector: 'CSS selector' },
  selector_text: { selector: 'CSS selector', expected: 'Substring of the text' },
  json_ld_type: { expected: '@type, e.g. Product' },
  robots_allows: { expected: 'User agent, default *' },
  robots_disallows: { expected: 'User agent, default *' },
}

/**
 * Seed checks from the finding's own exhibits. A page_element exhibit says
 * "this element is the problem", so the natural check is that it is gone.
 * The owner edits from there.
 */
export function checksFromExhibits(examples: Example[]): AcceptanceCheck[] {
  const out: AcceptanceCheck[] = []
  for (const e of examples) {
    if (e.kind === 'page_element' && e.url && e.selector) {
      out.push({ kind: 'selector_absent', url: e.url, selector: e.selector, note: e.caption ?? undefined })
    } else if ((e.kind === 'markup' || e.kind === 'response') && e.url) {
      out.push({ kind: 'http_status', url: e.url, expected: '200' })
    }
  }
  return out
}
