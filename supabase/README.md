# Database

The schema lives in the Supabase project `auditbuilder` (`vvekkbboqqkxnlpmxazh`).
The app's own migrations, in order (the SQL for the newest lives in `supabase/migrations/`):

| Version | Name | What it does |
|---|---|---|
| 20260904202539 | `core_schema` | Tables, enums, the `finding_scores` view, `updated_at` triggers |
| 20260904202602 | `signup_and_rls` | Signup trigger, RLS enabled, policies on every table |
| 20260904202644 | `harden_functions` | Moves every SECURITY DEFINER helper into a `private` schema so PostgREST cannot expose them as RPC |
| 20260904202748 | `allow_account_deletion` | Drops `on delete restrict` on the org creator; sweeps orgs whose last member left |
| 20260904204155 | `evidence_storage` | Private `evidence` bucket with per-tenant storage policies |
| 20260912000000 | `finding_lifecycle` | Post-delivery columns on `findings` (exposure, client decision, acceptance_checks, last check, outcome), append-only `finding_history` with trigger, `private.record_check` for the verifier, `finding_lifecycle` view with a derived `stage` |
| 20260912000200 | `verifier_api` | `verifier_queue` and `verifier_record`, service-role only, the verifier worker's whole database surface (see `verifier/`) |
| 20261123000000 | `field_review` | Audit `started_on` and evidence window, finding `scope` (segments plus an optional URL list), workspace `tools` table with RLS, two logic-mode rules retired, `seed_sample` copies the new columns |
| 20261123000100 | `sample_taxonomy` | Moves the sample audit and every seeded copy onto the universal taxonomy, the new references, tools on every measurement row and scope segments |
| 20261125100000 | `audit_checklists` | `audit_checks` (one row per check in an audit: pass, fail or not applicable, with the finding a fail raised) and `audit_templates` (a workspace's saved checklists, as snapshots), both with RLS; `audits.checklist_name`; `private.stamp_check` records who answered a check and when |

## Pull them into this repo

```bash
npm i -g supabase
supabase login
supabase link --project-ref vvekkbboqqkxnlpmxazh
supabase db pull            # writes supabase/migrations/*.sql
```

## Shape

```
orgs ─┬─ memberships ── auth.users
      ├─ brands ── audits ─┬─ findings ── examples
      │                    └─ audit_checks ··· findings   (a failed check points at its finding)
      └─ audit_templates
```

Every content table carries `org_id`, and every policy checks membership
against it. That column is the tenant boundary, including in Storage, where
object paths are `<org_id>/<uuid>.<ext>` and the first path segment is checked
the same way.

## The score

`finding_scores` computes `risk_factor` and `score` from the finding's inputs.
`src/lib/score.ts` mirrors it so the number updates while you type and matches
what the database returns after save. **If you change one, change both.**

## Verified isolation

Two users were created, one given a brand and an audit:

- the owner saw 1 brand, 1 audit, their own org
- the other saw 0 brands, 0 audits, only their own org
- an unknown token saw nothing
- an insert aimed directly at another org's id was rejected
