-- Checklists: what an audit set out to look at, and how each check came out.
--
-- Additive only. Nothing that exists today reads these tables, and the one
-- new column on audits is nullable, so the portal, the API worker and the
-- verifier are untouched.
--
--   audit_checks     one row per check in one audit: pass, fail or not applicable
--   audit_templates  a workspace's saved checklists, stored as snapshots
--
-- A check is not a finding. It is what was looked at. Only a failed check
-- raises a finding, which is how an audit can say what came back clean.
-- The universal check library ships in the app (src/lib/checks.ts), the same
-- way the taxonomy and the tool list do.

-- ---------------------------------------------------------------- audits
-- The name of the checklist the audit was started from, kept as text because
-- the checks are copied in: editing or deleting the template later never
-- changes an audit that already used it.
alter table public.audits
  add column if not exists checklist_name text;

-- ------------------------------------------------------------- templates
-- checks: [{ key: string|null, path: "Category/Subcategory", title, tool, pass }]
-- key names an entry in the universal library; null is one the workspace wrote.
create table if not exists public.audit_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text,
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.audit_templates enable row level security;

drop policy if exists audit_templates_select on public.audit_templates;
drop policy if exists audit_templates_insert on public.audit_templates;
drop policy if exists audit_templates_update on public.audit_templates;
drop policy if exists audit_templates_delete on public.audit_templates;
create policy audit_templates_select on public.audit_templates for select using (private.is_member(org_id));
create policy audit_templates_insert on public.audit_templates for insert with check (private.can_write(org_id));
create policy audit_templates_update on public.audit_templates for update using (private.can_write(org_id)) with check (private.can_write(org_id));
create policy audit_templates_delete on public.audit_templates for delete using (private.can_write(org_id));

drop trigger if exists t_audit_templates_touch on public.audit_templates;
create trigger t_audit_templates_touch before update on public.audit_templates
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- checks
create table if not exists public.audit_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  -- Library key, or null for a check the workspace wrote.
  key text,
  -- Category/Subcategory from the universal taxonomy.
  path text not null,
  title text not null check (btrim(title) <> ''),
  tool text,
  pass_criteria text,
  status text not null default 'todo' check (status in ('todo', 'pass', 'fail', 'na')),
  -- What came back, in a line. Optional.
  note text,
  -- The finding a failed check raised. Deleting the finding leaves the check
  -- failed and unlinked, so the audit still says the check did not pass.
  finding_id uuid references public.findings(id) on delete set null,
  position integer not null default 0,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A library check appears once per audit. Checks a workspace wrote are free.
create unique index if not exists audit_checks_audit_key
  on public.audit_checks (audit_id, key) where key is not null;
create index if not exists audit_checks_audit_position on public.audit_checks (audit_id, position);
create index if not exists audit_checks_org on public.audit_checks (org_id);
create index if not exists audit_checks_finding on public.audit_checks (finding_id) where finding_id is not null;
create index if not exists audit_templates_org on public.audit_templates (org_id);

alter table public.audit_checks enable row level security;

-- org_id is the tenant boundary, as everywhere else. These two also refuse a
-- row whose audit or finding belongs to a different workspace or audit, so a
-- check can never be attached to something its writer cannot see.
drop policy if exists audit_checks_select on public.audit_checks;
drop policy if exists audit_checks_insert on public.audit_checks;
drop policy if exists audit_checks_update on public.audit_checks;
drop policy if exists audit_checks_delete on public.audit_checks;
create policy audit_checks_select on public.audit_checks for select using (private.is_member(org_id));
create policy audit_checks_insert on public.audit_checks for insert with check (
  private.can_write(org_id)
  and exists (select 1 from public.audits a where a.id = audit_checks.audit_id and a.org_id = audit_checks.org_id)
  and (audit_checks.finding_id is null or exists (
    select 1 from public.findings f where f.id = audit_checks.finding_id and f.audit_id = audit_checks.audit_id))
);
create policy audit_checks_update on public.audit_checks for update using (private.can_write(org_id)) with check (
  private.can_write(org_id)
  and exists (select 1 from public.audits a where a.id = audit_checks.audit_id and a.org_id = audit_checks.org_id)
  and (audit_checks.finding_id is null or exists (
    select 1 from public.findings f where f.id = audit_checks.finding_id and f.audit_id = audit_checks.audit_id))
);
create policy audit_checks_delete on public.audit_checks for delete using (private.can_write(org_id));

-- Who marked it and when is recorded by the database, not sent by the client,
-- so the coverage a document prints cannot be backdated from a browser.
create or replace function private.stamp_check()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'todo' then
      new.checked_at = null;
      new.checked_by = null;
    else
      new.checked_at = now();
      new.checked_by = auth.uid();
    end if;
  else
    new.checked_at = old.checked_at;
    new.checked_by = old.checked_by;
  end if;
  return new;
end $function$;

drop trigger if exists t_audit_checks_stamp on public.audit_checks;
create trigger t_audit_checks_stamp before insert or update on public.audit_checks
  for each row execute function private.stamp_check();
