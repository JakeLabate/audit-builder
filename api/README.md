# AuditBuilder API

Two surfaces over the same handlers:

- MCP, Streamable HTTP, stateless, at `https://mcp.jakelabate.com/auditbuilder`.
  Signs in with an AuditBuilder account.
- `/v1/*` REST. Takes an API key.

## The MCP address

`https://mcp.jakelabate.com/auditbuilder` is the address people add. The
`mcp` worker that owns `mcp.jakelabate.com` (in the Website repo,
`scripts/mcp-server/`) has a service binding to this worker and passes two
paths through unchanged:

- `/auditbuilder`, the endpoint
- `/.well-known/oauth-protected-resource/auditbuilder`, its sign in metadata

A browser that opens the address is sent to the MCP page in the app. This
worker answers the same endpoint at its own `/mcp` too, so a client connected
before the move keeps working. Each address gets metadata naming itself as
the resource, which is what a client checks.

## Deploy

```bash
cd api
npm install
wrangler secret put SUPABASE_URL              # https://vvekkbboqqkxnlpmxazh.supabase.co
wrangler secret put SUPABASE_SERVICE_ROLE_KEY # Supabase > Project settings > API
wrangler deploy
```

The worker does not deploy when `main` changes. Run `npm run deploy` from
`api/` after pulling.

Then point `api.auditbuilder.jakelabate.com` at the worker in the Cloudflare
dashboard, under Workers > audit-api > Settings > Domains and Routes.

## MCP

### How it signs in

There is no key. An MCP client signs the person in through Supabase's OAuth
2.1 server, with the same account they use in the app, and the client sends
the access token it gets back. `src/oauth.ts` is the whole resource server:

1. A request without a valid token gets a `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://mcp.jakelabate.com/.well-known/oauth-protected-resource/auditbuilder"`.
2. The client reads that metadata (RFC 9728), which names Supabase Auth
   (`https://vvekkbboqqkxnlpmxazh.supabase.co/auth/v1`) as the authorization
   server, reads Supabase's own discovery document, and registers itself the
   first time (dynamic client registration).
3. Supabase sends the person to the app's consent page,
   `https://auditbuilder.jakelabate.com/oauth/consent`. If they are signed
   out, the app signs them in first and returns them there. They pick a
   workspace and press Allow. The page records the workspace in
   `mcp_connections` and approves the request.
4. The client gets a token and calls the endpoint with it. The worker checks the
   token with Supabase (`/auth/v1/user`, which also catches a revoked
   connection), reads `client_id` from it, and resolves the workspace from
   `mcp_connections`, falling back to the only workspace when there is one.

The connection acts as the person: owners and editors read and write, viewers
read. A plain app session token is refused, since it carries no `client_id`.
An old `ab_live_` key sent to the endpoint is refused with a message saying to
reconnect without it.

People see and disconnect their clients on the MCP page in the app.
Disconnecting revokes the grant in Supabase, so the client's tokens stop at
once.

### One time setup in Supabase

Authentication > OAuth Server:

- Enable the OAuth 2.1 server
- Authorization path: `/oauth/consent`
- Allow dynamic client registration: on

Authentication > URL Configuration: the Site URL must be
`https://auditbuilder.jakelabate.com`, since the authorization path is added to
it. The project already signs tokens with an asymmetric key (ES256), which
the OAuth server needs for `openid`.

### Connecting

- Claude: Settings > Connectors > Add custom connector, paste
  `https://mcp.jakelabate.com/auditbuilder`, Connect, sign in, Allow.
- Claude Code: `claude mcp add --transport http auditbuilder https://mcp.jakelabate.com/auditbuilder`,
  then `/mcp` to sign in.
- Anything else that supports MCP authorization: the URL, and no
  Authorization header.

Fifteen tools. `get_field_schema` is the one to call first: it returns every
field, its type, and who supplies it, so an agent sets what is its to set and
leaves the rest.

Audits in `mode=logic` enforce their rules in the database. A refusal comes
back as a readable sentence and is worth reading rather than retrying.

## REST API

### Auth

Every request carries a key:

```
Authorization: Bearer ab_live_...
```

Keys are made on the MCP page in the app, under REST API. A key belongs to
one workspace, can read and write everything in it, and carries the identity
of whoever made it, so an action taken through the API is attributable to a
person rather than to "the system". Only the SHA-256 is stored; the plaintext
is shown once and is not recoverable.

To mint one by hand:

```sql
with gen as (select 'ab_live_' || encode(extensions.gen_random_bytes(24),'hex') as plain),
ins as (
  insert into api_keys (org_id, name, key_hash, prefix, created_by)
  select '<org uuid>', '<label>',
         encode(extensions.digest(plain,'sha256'),'hex'), left(plain,16), '<user uuid>'
  from gen returning id)
select gen.plain from gen, ins;
```

Revoke with `update api_keys set revoked_at = now() where id = '<id>'`.

`GET /` lists every route and tool, unauthenticated, so the docs page in the
app is generated from the worker rather than kept beside it.

## Why the worker scopes rather than RLS

The worker holds the service role key, which bypasses row level security, so
org scoping is the worker's job, for both surfaces. It is centralised in
`db.ts`: every read and write goes through helpers that refuse to run without
an org, and every row that comes back is checked against that org before it
is returned. A dropped filter fails loudly rather than leaking another
consultant's audit.
