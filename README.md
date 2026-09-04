# AuditBuilder

Structured SEO audit findings, from record to deliverable.

Every finding is the same 40 fields, grouped as identity, scope, evidence,
impact, remedy, risk, priority and lifecycle. Because the record is fixed,
one finding can be sorted by score, filtered to an owner, grouped by template,
counted by band, and exported to four formats without being retyped.

The document is a view of the register, not the other way round.

## Stack

- **Supabase** for Postgres, OAuth, row level security and evidence storage
- **React + Vite + TypeScript**, no server of its own
- **Cloudflare Pages** at `auditbuilder.jakelabate.com`

## Exports

| Format | How it works |
|---|---|
| **JSON** | The full nested record, grouped exactly like the schema |
| **CSV** | The flat register projection, stable column order |
| **PDF** | The browser's own print engine against `src/export/print.css.ts`, which uses `@page` and mm units. No rendering service and no cost |
| **Google Sheets** | Creates a new sheet in the user's Drive using the `drive.file` scope only, which Google classifies as non-sensitive: the app can only touch files it created |

## Run it

```bash
npm install
cp .env.example .env      # fill in VITE_GOOGLE_CLIENT_ID if you want Sheets
npm run dev
```

## Before it goes live

1. **Supabase Auth providers.** Dashboard → Authentication → Providers. Enable
   Google and GitHub, paste each client id and secret, and add the callback
   `https://vvekkbboqqkxnlpmxazh.supabase.co/auth/v1/callback` to both.
2. **Redirect URLs.** Dashboard → Authentication → URL Configuration. Add
   `https://auditbuilder.jakelabate.com` and `http://localhost:5173`.
3. **Cloudflare Pages.** Connect this repo, build command `npm run build`,
   output directory `dist`. Add `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_GOOGLE_CLIENT_ID` as environment
   variables, then attach the custom domain.
4. **Google Cloud, for Sheets only.** Create an OAuth client of type Web,
   authorized origin `https://auditbuilder.jakelabate.com`, scope
   `https://www.googleapis.com/auth/drive.file`. Sheets export is hidden until
   `VITE_GOOGLE_CLIENT_ID` is set, so the app works without it.

## Layout

```
src/
  lib/       supabase client, types mirroring the schema, the score formula, data access
  pages/     Login, Brands, BrandView, AuditView
  components/ Chrome, FindingEditor
  export/    serialize (JSON + CSV), pdf, print.css, sheets
supabase/    schema notes and how to pull the migrations
```

## Two rules worth keeping

**`impact_basis` is required whenever a quantity is asserted.** The editor
refuses to call a finding complete without it. Every number the document
prints has to say where it came from.

**`verification_method` is written before the fix, not after.** It is what
makes the register still useful six months later.
