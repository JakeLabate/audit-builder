-- The sample's document opens with its brief, so a new workspace sees the
-- Overview in the deliverable as well as in the app.
update public.audits
set sections = '[{"key":"cover","on":true},{"key":"brief","on":true},{"key":"summary","on":true},{"key":"contents","on":true},{"key":"method","on":true},{"key":"findings","on":true},{"key":"roadmap","on":true},{"key":"appendix","on":false}]'::jsonb
where id = 'd0c50000-0000-4000-8000-0000000a0d17';
