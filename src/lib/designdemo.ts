import type { Audit, Brand, FindingFull } from './types'

/**
 * A two page audit that exists only to show a design.
 *
 * The design picker draws each design as the real document, built by the real
 * exporter with the brand's own kit, so what is chosen is what will print.
 * That needs something to print which is always there, has no client's data
 * in it, and loads nothing over the network. This is it: a cover and one
 * finding with most of its optional parts filled, sized to sit on one page in
 * every design.
 *
 * The exhibit is drawn inline as a data URI so the preview makes no request.
 */

const SHOT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 250">' +
  '<rect width="640" height="250" fill="#fff"/><rect width="640" height="34" fill="#E9E9EF"/>' +
  '<rect x="14" y="11" width="150" height="12" rx="2" fill="#B8B9CC"/>' +
  '<rect x="14" y="52" width="120" height="184" rx="3" fill="#F1F1F6"/>' +
  '<g fill="#C9CADB"><rect x="26" y="68" width="80" height="8" rx="2"/><rect x="26" y="88" width="64" height="8" rx="2"/>' +
  '<rect x="26" y="108" width="88" height="8" rx="2"/><rect x="26" y="128" width="56" height="8" rx="2"/></g>' +
  '<rect x="20" y="62" width="108" height="82" rx="3" fill="none" stroke="#8A1C2B" stroke-width="3"/>' +
  '<g fill="#E3E4EE"><rect x="152" y="52" width="146" height="110" rx="3"/><rect x="314" y="52" width="146" height="110" rx="3"/>' +
  '<rect x="476" y="52" width="146" height="110" rx="3"/></g>' +
  '<g fill="#C9CADB"><rect x="152" y="174" width="110" height="9" rx="2"/><rect x="314" y="174" width="96" height="9" rx="2"/>' +
  '<rect x="476" y="174" width="120" height="9" rx="2"/><rect x="152" y="192" width="60" height="9" rx="2"/>' +
  '<rect x="314" y="192" width="60" height="9" rx="2"/><rect x="476" y="192" width="60" height="9" rx="2"/></g></svg>',
)

export const DEMO_IMAGES: Record<string, string> = { 'demo/facets': SHOT }

/** The audit, named for whichever brand is being previewed. */
export function demoAudit(brand: Brand): Audit {
  return {
    id: 'demo-audit', org_id: brand.org_id, brand_id: brand.id,
    title: 'Category template review', kind: null, is_sample: true, status: 'delivered', mode: 'manual',
    sections: [{ key: 'cover', on: true }, { key: 'findings', on: true }],
    scope_note: null, sources: [], gaps: null, urls_crawled: 38412, delivered_on: null,
    doc_compact: false, started_on: null, evidence_from: null, evidence_to: null,
    created_at: '', updated_at: '',
  }
}

const blank = {
  org_id: '', audit_id: 'demo-audit', templates: [], markets: [], source: [], affects: [],
  collected_from: null, collected_to: null, confidence_reason: null, quantity_value: null,
  quantity_unit: null, dependencies: [], depends_on: [], external_blockers: [], wave: 1,
  blast_radius: null, failure_likelihood: null, reversibility: null,
  confidence_factor: 1, verify_by: null, verified_on: null, closed_note: null,
  exposure: 'client' as const, decision: null, decided_at: null, decided_by: null, decision_note: null,
  acceptance_checks: [], last_check_at: null, last_check_result: null, implemented_on: null,
  outcome_note: null, outcome_value: null, outcome_unit: null, outcome_measured_on: null,
  created_at: '', updated_at: '', risk_factor: 1,
}

export const DEMO_FINDINGS: FindingFull[] = [
  {
    ...blank,
    id: 'demo-1', ref: 'Indexation/Canonicals/1', pillar: 'Indexation/Canonicals', position: 0,
    title: 'Filtered category URLs carry no canonical, so duplicates outrank the real categories',
    raised: '2026-10-14',
    scope: { segments: [{ type: 'template', name: 'Category' }], url_list: null },
    urls_affected: 31240,
    measurements: [
      { check: 'Category URLs with a query string and no canonical', result: '31,240 of 31,240', tool: 'Crawl › Canonicals' },
      { check: 'Categories whose top ranking URL is a filtered variant', result: '214 of 2,140', tool: 'Search Console › Performance' },
    ],
    confidence: 'high',
    impact_type: 'duplicate_content', metric_at_risk: null, time_horizon: null,
    impact_basis: 'In 214 categories the URL now ranking is a filtered variant rather than the category itself, and those variants convert at roughly half the rate.',
    action: 'Emit a self-referencing canonical on every clean category URL, and point every filtered variant at its parent.',
    steps: [
      'Output the canonical with the path only, dropping every parameter except the page number.',
      'Roll out, then request a re-crawl of the top 200 categories by clicks.',
    ],
    owner: 'Storefront platform', effort_days: 3,
    severity_weight: 5, reach: 0.9, leverage: 5,
    status: 'open',
    verification_method: 'Crawl the category tree with filters on and confirm no parameter URL is without a canonical.',
    examples: [{
      id: 'demo-e1', org_id: '', finding_id: 'demo-1', kind: 'page_element',
      caption: 'Every filter in the rail is a plain link to a crawlable URL', captured: '2026-10-14',
      redacted: false, url: null, selector: null, viewport_w: null, viewport_h: null, margin_top: null,
      margin_bottom: null, label: null, extract: null, highlight_lines: [], request: null, query: null,
      surface: null, reproducible: null, image_path: 'demo/facets', position: 0,
    }],
    score: 86, band: 'P1',
  },
]

/** A brand with no kit, for previewing a design before any brand exists. */
export const DEMO_BRAND: Brand = {
  id: 'demo-brand', org_id: '', name: 'Your client', domain: 'client.example',
  primary_color: null, logo_path: null, notes: null, identity: {}, registry: {},
  created_at: '', updated_at: '',
}

/** Four rows of register, enough to show a header, the notes and the stripes. */
export const DEMO_REGISTER = {
  headers: ['Ref', 'Finding', 'Priority', 'Owner', 'Effort'],
  notes: ['Permanent ID.', 'What is wrong, as a claim.', 'Position in this audit.', 'The team that can fix it.', 'Days.'],
  rows: [
    ['Indexation/Canonicals/1', 'Filtered category URLs carry no canonical', 'P1', 'Storefront', '3'],
    ['Crawling/Parameters/1', 'Most crawl goes to parameter URLs', 'P2', 'Storefront', '8'],
    ['Rendering/JavaScript/1', 'Intro copy is injected after load', 'P3', 'Storefront', '5'],
    ['Experience/Vitals/1', 'The hero image has no dimensions', 'P4', 'Design system', '2'],
  ],
}
