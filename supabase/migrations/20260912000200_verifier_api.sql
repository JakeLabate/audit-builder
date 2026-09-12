-- The verifier worker runs with the service role and talks to the database
-- through these two functions only. Both are hidden from anon and
-- authenticated so PostgREST never exposes them to a browser session.

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
    and (p_finding is null or f.id = p_finding)
    -- Undecided and rejected findings are not checked: nobody has promised to fix them.
    and (f.decision = 'accepted' or f.status in ('fixed', 'verified', 'reopened'))
  order by f.last_check_at asc nulls first
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.verifier_record(p_finding uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = public, private
as $$
  select private.record_check(p_finding, p_result);
$$;

revoke all on function public.verifier_queue(int, uuid) from public, anon, authenticated;
revoke all on function public.verifier_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.verifier_queue(int, uuid) to service_role;
grant execute on function public.verifier_record(uuid, jsonb) to service_role;
