-- Finding lifecycle: what happens to a finding after it is handed over.
--
-- A finding is the recommendation. This adds the columns that carry it
-- through the client's decision, implementation, machine verification and
-- measured outcome, plus an append-only history so the audit-day record is
-- always recoverable.
--
-- Lifecycle is derived, not stored as one enum:
--   delivered   audit.status = delivered and finding.exposure = client
--   decided     finding.decision is not null
--   implemented finding.status in (fixed, verified)
--   verified    finding.status = verified
--   measured    finding.outcome_measured_on is not null

-- 1. Columns ---------------------------------------------------------------

alter table public.findings
  add column if not exists exposure text not null default 'client'
    check (exposure in ('client', 'internal')),
  add column if not exists decision text
    check (decision in ('accepted', 'deferred', 'rejected')),
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by text,
  add column if not exists decision_note text,
  add column if not exists acceptance_checks jsonb not null default '[]'::jsonb,
  add column if not exists last_check_at timestamptz,
  add column if not exists last_check_result jsonb,
  add column if not exists implemented_on date,
  add column if not exists outcome_note text,
  add column if not exists outcome_value numeric,
  add column if not exists outcome_unit text,
  add column if not exists outcome_measured_on date;

comment on column public.findings.exposure is
  'client: shown in the client portal once the audit is delivered. internal: never shown, so it is not counted as an ignored recommendation.';
comment on column public.findings.decision is
  'The client''s call on the recommendation. Written only through portal.decide_finding or by the owner.';
comment on column public.findings.decided_by is
  'Recipient name from the portal, or "owner" when set from AuditBuilder.';
comment on column public.findings.acceptance_checks is
  'Ordered array of machine-checkable conditions. Each is {"kind","url","selector","expected","note"}. kind is one of http_status | redirect_to | header | canonical | selector_present | selector_absent | selector_text | json_ld_type | robots_allows | robots_disallows. All must pass for the finding to be verified.';
comment on column public.findings.last_check_result is
  '{"pass": bool, "checks": [{"kind","url","pass","observed","expected"}]} from the most recent verifier run.';
comment on column public.findings.implemented_on is
  'Date the client or their team reported the fix live. Verification is the checker''s job, not this column''s.';

-- 2. History ---------------------------------------------------------------

create table if not exists public.finding_history (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  finding_id uuid not null references public.findings(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  field text not null,
  old_value jsonb,
  new_value jsonb
);

comment on table public.finding_history is
  'Append-only. One row per tracked field change on a finding. actor is owner | client:<name> | checker.';

create index if not exists finding_history_finding_idx
  on public.finding_history (finding_id, at desc);

alter table public.finding_history enable row level security;

drop policy if exists finding_history_read on public.finding_history;
create policy finding_history_read on public.finding_history
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.org_id = finding_history.org_id and m.user_id = auth.uid()
  ));

-- No insert/update/delete policies: rows are written only by the trigger
-- below, which runs as the table owner.

-- 3. History trigger -------------------------------------------------------

create schema if not exists private;

create or replace function private.log_finding_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(current_setting('app.actor', true), 'owner');
  v_field text;
  v_old jsonb;
  v_new jsonb;
begin
  foreach v_field in array array[
    'status', 'decision', 'decision_note', 'exposure', 'action', 'steps',
    'acceptance_checks', 'implemented_on', 'verified_on',
    'outcome_value', 'outcome_unit', 'outcome_note', 'outcome_measured_on'
  ] loop
    v_old := to_jsonb(old) -> v_field;
    v_new := to_jsonb(new) -> v_field;
    if v_old is distinct from v_new then
      insert into public.finding_history (org_id, finding_id, actor, field, old_value, new_value)
      values (new.org_id, new.id, v_actor, v_field, v_old, v_new);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists findings_log_change on public.findings;
create trigger findings_log_change
  after update on public.findings
  for each row execute function private.log_finding_change();

-- Stamp decided_at when a decision is first set or changed.
create or replace function private.stamp_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.decision is distinct from old.decision then
    new.decided_at := case when new.decision is null then null else now() end;
    -- Caller did not name who decided, so use the actor (owner by default).
    if new.decided_by is not distinct from old.decided_by then
      new.decided_by := case when new.decision is null then null
                             else coalesce(current_setting('app.actor', true), 'owner') end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists findings_stamp_decision on public.findings;
create trigger findings_stamp_decision
  before update on public.findings
  for each row execute function private.stamp_decision();

-- 4. Verifier write path ---------------------------------------------------
-- The checker runs with the service role and calls this rather than updating
-- rows directly, so the status transitions live in one place.

create or replace function private.record_check(
  p_finding uuid,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass boolean := coalesce((p_result ->> 'pass')::boolean, false);
  v_status public.finding_status;
begin
  perform set_config('app.actor', 'checker', true);

  select status into v_status from public.findings where id = p_finding;

  update public.findings
  set last_check_at = now(),
      last_check_result = p_result,
      status = case
        when v_pass and v_status in ('open', 'in_progress', 'fixed', 'reopened') then 'verified'::public.finding_status
        when not v_pass and v_status = 'verified' then 'reopened'::public.finding_status
        else v_status
      end,
      verified_on = case
        when v_pass and v_status <> 'verified' then current_date
        when not v_pass and v_status = 'verified' then null
        else verified_on
      end
  where id = p_finding;
end $$;

revoke all on function private.record_check(uuid, jsonb) from public, anon, authenticated;

-- 5. Owner-side lifecycle view ---------------------------------------------

create or replace view public.finding_lifecycle
with (security_invoker = true) as
select
  f.id,
  f.org_id,
  f.audit_id,
  f.ref,
  f.title,
  f.exposure,
  f.status,
  f.decision,
  f.decided_at,
  f.decided_by,
  f.implemented_on,
  f.verified_on,
  f.last_check_at,
  (f.last_check_result ->> 'pass')::boolean as last_check_pass,
  jsonb_array_length(f.acceptance_checks) as check_count,
  f.outcome_value,
  f.outcome_unit,
  f.outcome_measured_on,
  case
    when f.outcome_measured_on is not null then 'measured'
    when f.status = 'verified' then 'verified'
    when f.status in ('fixed') or f.implemented_on is not null then 'implemented'
    when f.decision is not null then f.decision
    when a.status = 'delivered' and f.exposure = 'client' then 'delivered'
    when f.exposure = 'internal' then 'internal'
    else 'drafted'
  end as stage
from public.findings f
join public.audits a on a.id = f.audit_id;
