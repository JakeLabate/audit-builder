/**
 * The finding record. Mirrors the Postgres schema one to one.
 * Field groups follow the published spec: identity, scope, evidence,
 * impact, remedy, risk, priority, lifecycle.
 */

export type MembershipRole = 'owner' | 'editor' | 'viewer'
export type FindingStatus =
  | 'open' | 'in_progress' | 'fixed' | 'verified' | 'reopened' | 'accepted_risk'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ImpactType =
  | 'duplicate_content' | 'crawl_waste' | 'lost_visibility'
  | 'broken_experience' | 'compliance_exposure'
export type TimeHorizon =
  | 'already_happening' | 'next_crawl_cycle' | 'next_release' | 'latent'
export type AffectedParty = 'end_users' | 'crawlers' | 'internal_team'
export type PriorityBand = 'P1' | 'P2' | 'P3' | 'P4'
export type ExampleKind = 'page_element' | 'markup' | 'response' | 'serp'
export type AuditStatus = 'draft' | 'in_review' | 'delivered' | 'archived'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  byline: string | null
}

export interface Org { id: string; name: string; slug: string }

export interface Brand {
  id: string
  org_id: string
  name: string
  domain: string | null
  primary_color: string | null
  logo_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditSource { tool: string; window: string; confidence: ConfidenceLevel }

export interface Audit {
  id: string
  org_id: string
  brand_id: string
  title: string
  status: AuditStatus
  scope_note: string | null
  sources: AuditSource[]
  gaps: string | null
  urls_crawled: number | null
  delivered_on: string | null
  created_at: string
  updated_at: string
}

export interface Measurement { check: string; result: string; taken: string }

export interface Finding {
  id: string
  org_id: string
  audit_id: string

  // identity
  ref: string
  title: string
  pillar: string | null
  raised: string

  // scope
  urls_affected: number | null
  templates: string[]
  markets: string[]

  // evidence
  measurements: Measurement[]
  source: string[]
  collected_from: string | null
  collected_to: string | null
  confidence: ConfidenceLevel | null
  confidence_reason: string | null

  // impact
  impact_type: ImpactType | null
  metric_at_risk: string | null
  quantity_value: number | null
  quantity_unit: string | null
  impact_basis: string | null
  time_horizon: TimeHorizon | null
  affects: AffectedParty[]

  // remedy
  action: string | null
  steps: string[]
  owner: string | null
  effort_days: number | null
  dependencies: string[]
  wave: number | null

  // risk
  blast_radius: number | null
  failure_likelihood: number | null
  reversibility: number | null

  // priority inputs
  severity_weight: number | null
  reach: number | null
  confidence_factor: number | null
  leverage: number | null

  // lifecycle
  status: FindingStatus
  verification_method: string | null
  verify_by: string | null
  verified_on: string | null
  closed_note: string | null

  position: number
  created_at: string
  updated_at: string
}

export interface Example {
  id: string
  org_id: string
  finding_id: string
  kind: ExampleKind

  caption: string | null
  captured: string | null
  redacted: boolean

  url: string | null
  selector: string | null
  viewport_w: number | null
  viewport_h: number | null
  margin_top: number | null
  margin_bottom: number | null
  label: string | null

  extract: string | null
  highlight_lines: number[]
  request: string | null

  query: string | null
  surface: string | null
  reproducible: boolean | null

  image_path: string | null
  position: number
}

/** A finding joined with its exhibits and computed score. */
export interface FindingFull extends Finding {
  examples: Example[]
  score: number | null
  risk_factor: number | null
  band: PriorityBand | null
}
