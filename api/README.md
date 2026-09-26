# AuditBuilder API

Two surfaces over the same handlers:

- `/v1/*` REST
- `/mcp` MCP, Streamable HTTP, stateless

## Deploy

```bash
cd api
npm install
wrangler secret put SUPABASE_URL              # https://vvekkbboqqkxnlpmxazh.supabase.co
wrangler secret put SUPABASE_SERVICE_ROLE_KEY # Supabase > Project settings > API
wrangler deploy
```

Then point `api.auditbuilder.jakelabate.com` at the worker in the Cloudflare
dashboard, under Workers > audit-api > Settings > Domains and Routes.

## Auth

Every request carries a key:

```
Authorization: Bearer ab_live_...
```

Only the SHA-256 is stored. A key belongs to one workspace and carries the
identity of whoever minted it, so an action taken through the API is
attributable to a person rather than to "the system".

Mint one:

```sql
with gen as (select 'ab_live_' || encode(extensions.gen_random_bytes(24),'hex') as plain),
ins as (
  insert into api_keys (org_id, name, key_hash, prefix, created_by)
  select '<org uuid>', '<label>',
         encode(extensions.digest(plain,'sha256'),'hex'), left(plain,16), '<user uuid>'
  from gen returning id)
select gen.plain from gen, ins;
```

The plaintext is shown once and is not recoverable. Revoke with
`update api_keys set revoked_at = now() where id = '<id>'`.

## Why the worker scopes rather than RLS

The worker holds the service role key, which bypasses row level security, so
org scoping is the worker's job. It is centralised in `db.ts`: every read and
write goes through helpers that refuse to run without an org, and every row
that comes back is checked against that org before it is returned. A dropped
filter fails loudly rather than leaking another consultant's audit. There is
a test for exactly that.

## MCP

Add as a custom connector with the URL `https://<host>/mcp` and the key as a
bearer token. Fifteen tools. `get_field_schema` is the one to call first: it
returns every field, its type, and who supplies it, so an agent sets what is
its to set and leaves the rest.

Audits in `mode=logic` enforce their rules in the database. A refusal comes
back as a readable sentence and is worth reading rather than retrying.
