# Database

The schema lives in the Supabase project `auditbuilder` (`vvekkbboqqkxnlpmxazh`).
Five migrations are applied, in order:

| Version | Name | What it does |
|---|---|---|
| 20260904202539 | `core_schema` | Tables, enums, the `finding_scores` view, `updated_at` triggers |
| 20260904202602 | `signup_and_rls` | Signup trigger, RLS enabled, policies on every table |
| 20260904202644 | `harden_functions` | Moves every SECURITY DEFINER helper into a `private` schema so PostgREST cannot expose them as RPC |
| 20260904202748 | `allow_account_deletion` | Drops `on delete restrict` on the org creator; sweeps orgs whose last member left |
| 20260904204155 | `evidence_storage` | Private `evidence` bucket with per-tenant storage policies |

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
      └─ brands ── audits ── findings ── examples
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
