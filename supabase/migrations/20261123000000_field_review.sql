-- Field review, round one: identity, scope and evidence.
--
-- Everything here is additive or loosens a rule. No column is renamed or
-- dropped, because the client portal, the API worker and the verifier all
-- read `findings` directly, and a rename would break them mid-review.
--
--   pillar   now holds a path from the universal taxonomy, e.g. Crawling/Redirects
--   raised   is shown as "Found on" and defaults from audits.started_on
--   scope    is new: segments plus an optional uploaded URL list
--   tools    is new: tools a workspace adds on top of the universal list

-- ---------------------------------------------------------------- audits
alter table public.audits
  add column if not exists started_on date,
  add column if not exists evidence_from date,
  add column if not exists evidence_to date;

-- An audit started no later than its earliest finding.
update public.audits a
set started_on = least(a.created_at::date,
                       coalesce((select min(f.raised) from public.findings f where f.audit_id = a.id),
                                a.created_at::date))
where a.started_on is null;

-- The audit's evidence window is the span its findings already cite.
update public.audits a
set evidence_from = w.f, evidence_to = w.t
from (
  select audit_id, min(collected_from) f, max(collected_to) t
  from public.findings group by audit_id
) w
where w.audit_id = a.id and a.evidence_from is null and a.evidence_to is null;

alter table public.audits alter column started_on set default current_date;

-- -------------------------------------------------------------- findings
-- { segments: [{ type: template|component|pages|sitewide, name?, urls? }],
--   url_list: { path, count, name, uploaded_at } | null }
alter table public.findings
  add column if not exists scope jsonb not null default '{"segments": [], "url_list": null}'::jsonb;

-- Existing template picks become template segments.
update public.findings f
set scope = jsonb_build_object(
  'segments', coalesce((select jsonb_agg(jsonb_build_object('type', 'template', 'name', t))
                        from unnest(f.templates) t), '[]'::jsonb),
  'url_list', null)
where f.scope = '{"segments": [], "url_list": null}'::jsonb
  and cardinality(f.templates) > 0;

-- ----------------------------------------------------------------- tools
-- The universal list ships in the app. This table holds only what a
-- workspace adds, and every member of the workspace sees it in every audit.
create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent text not null,
  name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, parent, name)
);

alter table public.tools enable row level security;

drop policy if exists tools_select on public.tools;
drop policy if exists tools_insert on public.tools;
drop policy if exists tools_update on public.tools;
drop policy if exists tools_delete on public.tools;
create policy tools_select on public.tools for select using (private.is_member(org_id));
create policy tools_insert on public.tools for insert with check (private.can_write(org_id));
create policy tools_update on public.tools for update using (private.can_write(org_id)) with check (private.can_write(org_id));
create policy tools_delete on public.tools for delete using (private.can_write(org_id));

-- --------------------------------------------------- logic mode invariants
-- Two rules no longer hold:
--   * "collected_to after raised": Found on now defaults to the audit's
--     start date, which comes before most of the evidence by design.
--   * "source must be declared on the audit": sources are now worked out
--     from the tools on the measurement rows, so they cannot drift.
create or replace function private.check_logic_invariants()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  mode audit_mode;
  known text[];
  ignored text[] := array['last_check_at','last_check_result','updated_at'];
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - ignored) = (to_jsonb(old) - ignored) then
    return new;
  end if;

  select a.mode into mode from audits a where a.id = new.audit_id;
  if mode is null or mode <> 'logic' then return new; end if;

  if new.title is null or btrim(new.title) = '' then
    raise exception 'A finding needs a title stated as a claim.' using errcode = 'check_violation';
  end if;

  if new.confidence is not null and new.confidence <> 'high'
     and coalesce(btrim(new.confidence_reason), '') = '' then
    raise exception 'Confidence is %, so the confidence reason has to say why it is not high.', new.confidence
      using errcode = 'check_violation';
  end if;

  if new.quantity_value is not null and coalesce(btrim(new.impact_basis), '') = '' then
    raise exception 'You asserted a quantity. The impact basis has to say where it came from.'
      using errcode = 'check_violation';
  end if;

  if new.status in ('fixed','verified','accepted_risk')
     and coalesce(btrim(new.closed_note), '') = '' then
    raise exception 'Status is %, so the closed note has to say what changed.', new.status
      using errcode = 'check_violation';
  end if;

  if (new.verified_on is not null) <> (new.status = 'verified') then
    raise exception 'Verified on and a status of verified go together. One without the other is not a state a finding can be in.'
      using errcode = 'check_violation';
  end if;

  if new.collected_from is not null and new.collected_to is not null
     and new.collected_from > new.collected_to then
    raise exception 'The evidence window runs backwards: % to %.', new.collected_from, new.collected_to
      using errcode = 'check_violation';
  end if;

  if new.verify_by is not null and new.verify_by <= new.raised then
    raise exception 'Verify by has to fall after the finding was found.' using errcode = 'check_violation';
  end if;

  if cardinality(new.markets) > 0 then
    select array_agg(m #>> '{}') into known
    from brands b, audits a, jsonb_array_elements(b.registry->'markets') m
    where a.id = new.audit_id and b.id = a.brand_id;
    if known is not null and cardinality(known) > 0
       and exists (select 1 from unnest(new.markets) t where t <> all(known)) then
      raise exception 'A market here is not in this brand''s registry.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $function$;

-- ------------------------------------------------------------ sample seed
-- Copies the new columns too, so a new workspace's sample shows the new shape.
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

  insert into brands (id, org_id, name, domain, primary_color, notes, registry, identity, is_sample)
  select new_brand, p_org, name, domain, primary_color, notes, registry, identity, true
  from brands where id = src_brand;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sample brand not copied: % rows.', n; end if;

  insert into audits (id, org_id, brand_id, title, kind, status, mode, scope_note,
                      sources, gaps, urls_crawled, delivered_on, sections, sheet_columns, is_sample,
                      started_on, evidence_from, evidence_to)
  select new_audit, p_org, new_brand, title, kind, status, mode, scope_note,
         sources, gaps, urls_crawled, delivered_on, sections, sheet_columns, true,
         started_on, evidence_from, evidence_to
  from audits where id = src_audit;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sample audit not copied: % rows.', n; end if;

  -- MATERIALIZED is load bearing: without it the CTE can be re-evaluated at
  -- each reference, handing out different uuids each time.
  with map as materialized (
    select f.id as old, gen_random_uuid() as new
    from findings f where f.audit_id = src_audit
  ),
  copied as (
    insert into findings (
      id, org_id, audit_id, ref, title, pillar, raised, urls_affected, templates, markets,
      measurements, source, collected_from, collected_to, confidence, confidence_reason,
      impact_type, metric_at_risk, quantity_value, quantity_unit, impact_basis, time_horizon,
      affects, action, steps, owner, effort_days, dependencies, external_blockers, wave,
      blast_radius, failure_likelihood, reversibility, severity_weight, reach,
      confidence_factor, leverage, status, verification_method, verify_by, verified_on,
      closed_note, exposure, acceptance_checks, position, depends_on, scope)
    select m.new, p_org, new_audit, f.ref, f.title, f.pillar, f.raised, f.urls_affected,
      f.templates, f.markets, f.measurements, f.source, f.collected_from, f.collected_to,
      f.confidence, f.confidence_reason, f.impact_type, f.metric_at_risk, f.quantity_value,
      f.quantity_unit, f.impact_basis, f.time_horizon, f.affects, f.action, f.steps, f.owner,
      f.effort_days, f.dependencies, f.external_blockers, f.wave, f.blast_radius,
      f.failure_likelihood, f.reversibility, f.severity_weight, f.reach, f.confidence_factor,
      f.leverage, f.status, f.verification_method, f.verify_by, f.verified_on, f.closed_note,
      f.exposure, f.acceptance_checks, f.position,
      coalesce((select array_agg(dm.new) from unnest(f.depends_on) d
                join map dm on dm.old = d), '{}'),
      f.scope
    from findings f join map m on m.old = f.id
    where f.audit_id = src_audit
    returning 1
  )
  insert into examples (org_id, finding_id, kind, caption, captured, redacted, url, selector,
                        viewport_w, viewport_h, margin_top, margin_bottom, label, extract,
                        highlight_lines, request, query, surface, reproducible, position)
  select p_org, m.new, e.kind, e.caption, e.captured, e.redacted, e.url, e.selector,
         e.viewport_w, e.viewport_h, e.margin_top, e.margin_bottom, e.label, e.extract,
         e.highlight_lines, e.request, e.query, e.surface, e.reproducible, e.position
  from examples e join map m on m.old = e.finding_id;

  select count(*) into n from findings where audit_id = new_audit;
  if n <> (select count(*) from findings where audit_id = src_audit) then
    raise exception 'Sample findings not fully copied: % of %.',
      n, (select count(*) from findings where audit_id = src_audit);
  end if;

  return new_audit;
end $function$;
