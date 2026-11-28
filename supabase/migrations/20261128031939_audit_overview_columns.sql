-- The audit's own layer, shown on its Overview tab: the brief it answers, the
-- numbers it is judged on and where they stood at the start, what it covers,
-- and what it concluded across its findings.

alter table public.audits
  add column if not exists question text,
  add column if not exists objective text,
  add column if not exists commissioned_by text,
  add column if not exists due_on date,
  add column if not exists kpis jsonb not null default '[]'::jsonb,
  add column if not exists scope jsonb not null default '{}'::jsonb,
  add column if not exists summary text,
  add column if not exists themes jsonb not null default '[]'::jsonb;

alter table public.audits
  add constraint audits_kpis_is_array check (jsonb_typeof(kpis) = 'array'),
  add constraint audits_scope_is_object check (jsonb_typeof(scope) = 'object'),
  add constraint audits_themes_is_array check (jsonb_typeof(themes) = 'array');

comment on column public.audits.question is 'The question the audit answers, in the client''s terms.';
comment on column public.audits.objective is 'The business outcome the work is for.';
comment on column public.audits.commissioned_by is 'Who asked for the audit.';
comment on column public.audits.due_on is 'When the deliverable is due.';
comment on column public.audits.kpis is 'The numbers the audit is judged on, each with its baseline: [{id, name, unit, baseline, as_of, source}]. Baselines are typed by a person, never estimated.';
comment on column public.audits.scope is 'What the audit covers: {hosts, markets, templates, devices, excluded}, each a list of strings. A finding outside it is flagged. scope_note stays as the narrative.';
comment on column public.audits.summary is 'The executive summary, written by a person.';
comment on column public.audits.themes is 'Root causes the findings group under: [{id, title, note, finding_ids}]. A finding sits in one theme at most.';
