-- Compact mode for the exported document: hold each finding to one page.
-- Off by default, so a long finding runs onto a second page and nothing is
-- left out. Chosen per audit in the export dialog.
alter table audits add column if not exists doc_compact boolean not null default false;
