-- Export designs: how the document and the register look.
--
-- The choice is made at three levels, most specific first: the audit, its
-- brand, the workspace. Each level stores only what it chose, as
-- {"pdf": "...", "sheet": "..."} with either key optional. An empty object
-- means the level chose nothing and follows the one above it, so changing the
-- workspace design reaches every brand and audit that never picked its own.
--
-- The keys are not constrained here. The app repairs what it reads (see
-- src/lib/designs.ts): a value it does not know falls through to the level
-- above, so retiring a design later needs no data migration.
--
-- Existing rows get the empty object, and with nothing chosen anywhere the
-- app uses the designs it has always exported. Nothing changes until someone
-- picks one.

alter table public.orgs   add column if not exists export_design jsonb not null default '{}'::jsonb;
alter table public.brands add column if not exists export_design jsonb not null default '{}'::jsonb;
alter table public.audits add column if not exists export_design jsonb not null default '{}'::jsonb;

alter table public.orgs   drop constraint if exists orgs_export_design_object;
alter table public.brands drop constraint if exists brands_export_design_object;
alter table public.audits drop constraint if exists audits_export_design_object;
alter table public.orgs   add constraint orgs_export_design_object   check (jsonb_typeof(export_design) = 'object');
alter table public.brands add constraint brands_export_design_object check (jsonb_typeof(export_design) = 'object');
alter table public.audits add constraint audits_export_design_object check (jsonb_typeof(export_design) = 'object');

comment on column public.orgs.export_design   is 'Workspace default export design: {"pdf","sheet"}, either optional. Empty follows the built-in design.';
comment on column public.brands.export_design is 'Brand export design: {"pdf","sheet"}, either optional. A missing key follows the workspace.';
comment on column public.audits.export_design is 'Audit export design: {"pdf","sheet"}, either optional. A missing key follows the brand, then the workspace.';

-- The ledger records which designs an export was made with, so "what did we
-- send them" can be answered down to how it looked. Null on rows from before.
alter table public.exports add column if not exists design jsonb;
comment on column public.exports.design is 'The designs this export used, resolved: {"pdf","sheet"}.';
