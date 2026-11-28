-- Migration 20261128020339: sample_seed_full_copy_and_verifier_skips_samples (applied 2026-11-28)

-- 1. The verifier never checks a sample. Sample URLs live on a reserved
--    .example domain, so every fetch fails and a verified sample finding
--    would be reopened in every workspace that holds a copy.
create or replace function public.verifier_queue(p_limit int default 50, p_finding uuid default null)
returns table (
  id uuid,
  ref text,
  acceptance_checks jsonb,
  last_check_at timestamptz,
  status public.finding_status
)
language sql
stable security definer
set search_path = public
as $$
  select f.id, f.ref, f.acceptance_checks, f.last_check_at, f.status
  from public.findings f
  join public.audits a on a.id = f.audit_id
  where jsonb_array_length(f.acceptance_checks) > 0
    and f.status <> 'accepted_risk'
    and f.exposure = 'client'
    and a.status = 'delivered'
    and not a.is_sample
    and (p_finding is null or f.id = p_finding)
    -- Undecided and rejected findings are not checked: nobody has promised to fix them.
    and (f.decision = 'accepted' or f.status in ('fixed', 'verified', 'reopened'))
  order by f.last_check_at asc nulls first
  limit greatest(1, least(p_limit, 200));
$$;

-- 2. The sample is copied whole: every finding column including the
--    after-delivery lifecycle, exhibit images, the brand logo, the audit's
--    document settings and its checklist. New ids are derived from the
--    workspace and the template id, so findings, exhibits, dependencies and
--    checks all map without a lookup table.
create or replace function private.seed_sample(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  src_brand constant uuid := 'd0c50000-0000-4000-8000-0000000b4a4d';
  src_audit constant uuid := 'd0c50000-0000-4000-8000-0000000a0d17';
  src_org   constant uuid := 'd0c50000-0000-4000-8000-00000000d0c5';
  new_brand uuid := gen_random_uuid();
  new_audit uuid := gen_random_uuid();
  n integer;
begin
  if p_org = src_org or exists (select 1 from brands where org_id = p_org and is_sample) then
    return null;
  end if;

  if not exists (select 1 from audits where id = src_audit) then
    raise exception 'The sample template is missing. Expected audit % in org %.', src_audit, src_org;
  end if;

  insert into brands (id, org_id, name, domain, primary_color, logo_path, notes, registry, identity, is_sample)
  select new_brand, p_org, name, domain, primary_color, logo_path, notes, registry, identity, true
  from brands where id = src_brand;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sample brand not copied: % rows.', n; end if;

  insert into audits (id, org_id, brand_id, title, kind, status, mode, scope_note,
                      sources, gaps, urls_crawled, delivered_on, sections, sheet_columns, is_sample,
                      started_on, evidence_from, evidence_to, doc_compact, checklist_name)
  select new_audit, p_org, new_brand, title, kind, status, mode, scope_note,
         sources, gaps, urls_crawled, delivered_on, sections, sheet_columns, true,
         started_on, evidence_from, evidence_to, doc_compact, checklist_name
  from audits where id = src_audit;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sample audit not copied: % rows.', n; end if;

  insert into findings (
    id, org_id, audit_id, ref, title, pillar, raised, urls_affected, templates, markets,
    measurements, source, collected_from, collected_to, confidence, confidence_reason,
    impact_type, metric_at_risk, quantity_value, quantity_unit, impact_basis, time_horizon,
    affects, action, steps, owner, effort_days, dependencies, external_blockers, wave,
    blast_radius, failure_likelihood, reversibility, severity_weight, reach,
    confidence_factor, leverage, status, verification_method, verify_by, verified_on,
    closed_note, exposure, decision, decided_at, decided_by, decision_note,
    acceptance_checks, last_check_at, last_check_result, implemented_on,
    outcome_note, outcome_value, outcome_unit, outcome_measured_on,
    position, depends_on, scope)
  select md5(p_org::text || f.id::text)::uuid, p_org, new_audit, f.ref, f.title, f.pillar, f.raised,
    f.urls_affected, f.templates, f.markets, f.measurements, f.source, f.collected_from,
    f.collected_to, f.confidence, f.confidence_reason, f.impact_type, f.metric_at_risk,
    f.quantity_value, f.quantity_unit, f.impact_basis, f.time_horizon, f.affects, f.action,
    f.steps, f.owner, f.effort_days, f.dependencies, f.external_blockers, f.wave,
    f.blast_radius, f.failure_likelihood, f.reversibility, f.severity_weight, f.reach,
    f.confidence_factor, f.leverage, f.status, f.verification_method, f.verify_by,
    f.verified_on, f.closed_note, f.exposure, f.decision, f.decided_at, f.decided_by,
    f.decision_note, f.acceptance_checks, f.last_check_at, f.last_check_result,
    f.implemented_on, f.outcome_note, f.outcome_value, f.outcome_unit, f.outcome_measured_on,
    f.position,
    coalesce((select array_agg(md5(p_org::text || d::text)::uuid)
              from unnest(f.depends_on) d
              where d in (select s.id from findings s where s.audit_id = src_audit)), '{}'),
    f.scope
  from findings f
  where f.audit_id = src_audit;

  insert into examples (org_id, finding_id, kind, caption, captured, redacted, url, selector,
                        viewport_w, viewport_h, margin_top, margin_bottom, label, extract,
                        highlight_lines, request, query, surface, reproducible, image_path, position)
  select p_org, md5(p_org::text || e.finding_id::text)::uuid, e.kind, e.caption, e.captured,
         e.redacted, e.url, e.selector, e.viewport_w, e.viewport_h, e.margin_top, e.margin_bottom,
         e.label, e.extract, e.highlight_lines, e.request, e.query, e.surface, e.reproducible,
         e.image_path, e.position
  from examples e
  join findings f on f.id = e.finding_id
  where f.audit_id = src_audit;

  insert into audit_checks (org_id, audit_id, key, path, title, tool, pass_criteria, status,
                            note, finding_id, position, checked_at)
  select p_org, new_audit, c.key, c.path, c.title, c.tool, c.pass_criteria, c.status, c.note,
         case when c.finding_id is null then null else md5(p_org::text || c.finding_id::text)::uuid end,
         c.position, c.checked_at
  from audit_checks c
  where c.audit_id = src_audit;

  select count(*) into n from findings where audit_id = new_audit;
  if n <> (select count(*) from findings where audit_id = src_audit) then
    raise exception 'Sample findings not fully copied: % of %.',
      n, (select count(*) from findings where audit_id = src_audit);
  end if;

  select count(*) into n from examples e join findings f on f.id = e.finding_id where f.audit_id = new_audit;
  if n <> (select count(*) from examples e join findings f on f.id = e.finding_id where f.audit_id = src_audit) then
    raise exception 'Sample exhibits not fully copied: % rows.', n;
  end if;

  return new_audit;
end $function$;
