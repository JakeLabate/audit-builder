# Verifier

A Cloudflare Worker that proves findings are fixed. It runs every six hours,
takes findings that carry `acceptance_checks`, fetches the pages, tests each
condition, and reports the result to Postgres through `verifier_record`.
The database owns the status transitions:

- every check passes: status becomes `verified`, `verified_on` is stamped
- a verified finding fails later: status becomes `reopened`
- anything else: `last_check_at` and `last_check_result` update, status stays

## Which findings are checked

`verifier_queue` returns findings that have at least one check, are exposed
to the client, sit under a delivered audit, and are either accepted by the
client or already reported fixed / verified / reopened. Undecided and
rejected findings are skipped: nobody has promised to fix them.

## Check kinds

| kind | inputs | passes when |
|---|---|---|
| `http_status` | url, expected (default 200) | the status code matches, no redirects followed |
| `redirect_to` | url, expected | the final URL after up to five hops equals expected |
| `header` | url, selector (header name), expected | the header exists and contains expected |
| `canonical` | url, expected | `link[rel=canonical]` resolves to expected |
| `selector_present` | url, selector | at least one element matches |
| `selector_absent` | url, selector | no element matches |
| `selector_text` | url, selector, expected | the matched text contains expected |
| `json_ld_type` | url, expected | any JSON-LD block (including `@graph` and nested entities) has that `@type` |
| `robots_allows` | url, expected (user agent, default `*`) | robots.txt allows the path |
| `robots_disallows` | url, expected (user agent) | robots.txt blocks the path |

URL comparison ignores a trailing slash and the fragment; the query string
counts.

## Deploy

```bash
cd verifier
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put VERIFIER_KEY
npm run deploy
```

## Run on demand

```bash
curl -X POST "https://audit-verifier.<account>.workers.dev/run?finding=<uuid>" \
  -H "x-verifier-key: $VERIFIER_KEY"
```

Omit `finding` to run a normal batch. The response lists each finding
checked and whether it passed.
