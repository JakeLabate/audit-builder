-- Register columns follow the findings by default.
--
-- Until now every audit was created with a stored list: the first 14 columns
-- on, the other 19 off. That list was a guess made before the audit had any
-- findings. The default is now worked out in the app at export time: a column
-- is on when at least one finding has a value in it.
--
-- Null means nobody has chosen, so the default applies. A stored list means
-- somebody chose, and it wins.

alter table audits alter column sheet_columns drop not null;

-- Audits still holding the old default were never changed by hand.
update audits
   set sheet_columns = null
 where sheet_columns = '[{"on": true, "key": "ref"}, {"on": true, "key": "title"}, {"on": true, "key": "band"}, {"on": true, "key": "score"}, {"on": true, "key": "status"}, {"on": true, "key": "owner"}, {"on": true, "key": "effort_days"}, {"on": true, "key": "wave"}, {"on": true, "key": "urls_affected"}, {"on": true, "key": "templates"}, {"on": true, "key": "impact_basis"}, {"on": true, "key": "action"}, {"on": true, "key": "verification_method"}, {"on": true, "key": "verify_by"}, {"on": false, "key": "pillar"}, {"on": false, "key": "markets"}, {"on": false, "key": "impact_type"}, {"on": false, "key": "metric_at_risk"}, {"on": false, "key": "quantity"}, {"on": false, "key": "time_horizon"}, {"on": false, "key": "confidence"}, {"on": false, "key": "collected"}, {"on": false, "key": "sources"}, {"on": false, "key": "steps"}, {"on": false, "key": "depends_on"}, {"on": false, "key": "blockers"}, {"on": false, "key": "severity"}, {"on": false, "key": "reach"}, {"on": false, "key": "leverage"}, {"on": false, "key": "risk"}, {"on": false, "key": "decision"}, {"on": false, "key": "verified_on"}, {"on": false, "key": "closed_note"}]'::jsonb;

alter table audits alter column sheet_columns drop default;
