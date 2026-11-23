-- Move the sample audit onto the universal taxonomy, the new references, tools
-- on every measurement row, and scope segments.
--
-- Applies to the sample template and to every copy already seeded into a
-- workspace. Samples are not client deliverables, so their references are not
-- citations anyone relies on: the freeze trigger is lifted for this statement
-- only and restored straight after.

create temporary table sample_map (
  old_ref text primary key,
  category text not null,
  new_ref text not null,
  tools text[] not null,
  segments jsonb not null
) on commit drop;

insert into sample_map values
 ('CRWL-001', 'Crawling/Waste', 'Crawling/Waste/1',
  array['Screaming Frog › Crawl','Screaming Frog › Crawl','Server logs › Bot requests','Screaming Frog › Crawl'],
  '[{"type":"template","name":"Category listing"},{"type":"template","name":"Collection filter"}]'),
 ('IDX-001', 'Indexation/Canonicals', 'Indexation/Canonicals/1',
  array['Screaming Frog › Crawl','Screaming Frog › Crawl','Search Console › URL Inspection'],
  '[{"type":"template","name":"Category listing"}]'),
 ('SD-001', 'Schema/Errors', 'Schema/Errors/1',
  array['Screaming Frog › Custom extraction','Rich Results Test › Live test','Screaming Frog › Custom extraction','Screaming Frog › Custom extraction','Search Console › Merchant listings'],
  '[{"type":"template","name":"Product detail"}]'),
 ('CRWL-002', 'Indexation/Directives', 'Indexation/Directives/1',
  array['Screaming Frog › Crawl','Manual review › Search results','Server logs › Bot requests'],
  '[{"type":"template","name":"Internal search results"}]'),
 ('INTL-001', 'International/Hreflang', 'International/Hreflang/1',
  array['Screaming Frog › Hreflang','Screaming Frog › Hreflang','Search Console › Legacy reports'],
  '[{"type":"template","name":"Product detail"},{"type":"template","name":"Category listing"},{"type":"template","name":"Editorial"}]'),
 ('PERF-001', 'Performance/Vitals', 'Performance/Vitals/1',
  array['PageSpeed Insights › Field (CrUX)','PageSpeed Insights › Field (CrUX)','Chrome DevTools › Performance trace','Chrome DevTools › Network'],
  '[{"type":"template","name":"Category listing"},{"type":"component","name":"Hero banner"}]'),
 ('CNT-001', 'Content/Quality', 'Content/Quality/1',
  array['Screaming Frog › Near duplicates','Screaming Frog › Near duplicates','Manual review › Browser'],
  '[{"type":"template","name":"Category listing"}]'),
 ('CMP-001', 'Experience/Interstitials', 'Experience/Interstitials/1',
  array['Manual review › Browser','Manual review › Browser','Search Console › URL Inspection'],
  '[{"type":"sitewide"},{"type":"component","name":"Consent banner"}]'),
 ('LINK-001', 'Architecture/Depth', 'Architecture/Depth/1',
  array['Screaming Frog › Orphans','Search Console › Performance','Manual review › Browser'],
  '[{"type":"template","name":"Product detail"}]'),
 ('UX-001', 'Architecture/Navigation', 'Architecture/Navigation/1',
  array['Screaming Frog › Custom extraction','Manual review › Browser','Google Analytics 4 › Reports'],
  '[{"type":"template","name":"Product detail"},{"type":"component","name":"Breadcrumb"}]');

alter table public.findings disable trigger trg_freeze_ref;

update public.findings f
set pillar = m.category,
    ref = m.new_ref,
    scope = jsonb_build_object('segments', m.segments, 'url_list', null),
    templates = coalesce((select array_agg(s->>'name') from jsonb_array_elements(m.segments) s
                          where s->>'type' = 'template'), '{}'),
    measurements = (
      select coalesce(jsonb_agg(r.v || jsonb_build_object('tool', m.tools[r.ord]) order by r.ord), '[]'::jsonb)
      from jsonb_array_elements(f.measurements) with ordinality r(v, ord)
    ),
    source = (
      select coalesce(array_agg(g order by first_ord), '{}') from (
        select split_part(t, ' › ', 1) g, min(o) first_ord
        from unnest(m.tools) with ordinality u(t, o) group by 1
      ) x
    ),
    confidence_factor = case f.confidence when 'high' then 1 when 'medium' then 0.8 when 'low' then 0.6 else f.confidence_factor end
from sample_map m, public.audits a
where a.id = f.audit_id and a.is_sample and f.ref = m.old_ref;

alter table public.findings enable trigger trg_freeze_ref;

-- The sample brand's templates are names only, and it gains components.
update public.brands b
set registry = jsonb_set(
  jsonb_set(b.registry, '{templates}',
    '[{"name":"Category listing"},{"name":"Collection filter"},{"name":"Product detail"},{"name":"Internal search results"},{"name":"Editorial"}]'::jsonb),
  '{components}',
  '[{"name":"Hero banner"},{"name":"Breadcrumb"},{"name":"Consent banner"},{"name":"Faceted filters"},{"name":"Product carousel"}]'::jsonb)
where b.is_sample;
