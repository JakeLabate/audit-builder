-- Sample audits already copied into workspaces get the overview the template
-- now has (20261128032145). Kept apart from that migration because it writes
-- to other people's workspaces; applied once Jake approved it.
-- Copies already made carry the same overview. Their findings are matched by
-- reference, which is the same in every copy. Only columns that were empty
-- until now are written, and the scope note only where nobody has edited it.
update public.audits c set
  question = t.question, objective = t.objective, commissioned_by = t.commissioned_by,
  due_on = t.due_on, kpis = t.kpis, scope = t.scope, summary = t.summary,
  scope_note = case when c.scope_note = $q$Full crawl of the www property across the US, CA and UK storefronts. Covers indexation, crawl efficiency, structured data, internationalisation, page experience and internal linking. Excludes the help centre subdomain, the careers site and paid landing pages under /lp/, which are noindexed by design and out of contract for this engagement.$q$ then t.scope_note else c.scope_note end,
  themes = coalesce((
    select jsonb_agg(th || jsonb_build_object('finding_ids', coalesce((
      select jsonb_agg(cf.id)
      from jsonb_array_elements_text(th->'finding_ids') x
      join findings tf on tf.id = x::uuid
      join findings cf on cf.audit_id = c.id and cf.ref = tf.ref), '[]'::jsonb)))
    from jsonb_array_elements(t.themes) th), '[]'::jsonb)
from public.audits t
where t.id = 'd0c50000-0000-4000-8000-0000000a0d17'
  and c.is_sample and c.id <> t.id
  and c.question is null and c.summary is null and c.kpis = '[]'::jsonb;

-- And their documents open with the brief, where nobody has changed which
-- sections the document has.
update public.audits c set sections = t.sections
from public.audits t
where t.id = 'd0c50000-0000-4000-8000-0000000a0d17'
  and c.is_sample and c.id <> t.id
  and c.sections = '[{"key":"cover","on":true},{"key":"summary","on":true},{"key":"contents","on":true},{"key":"method","on":true},{"key":"findings","on":true},{"key":"roadmap","on":true},{"key":"appendix","on":false}]'::jsonb;
