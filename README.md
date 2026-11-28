# AuditBuilder

Structured SEO audit findings, from record to deliverable.

Every finding is the same 53 fields, grouped as identity, scope, evidence,
impact, remedy, risk, priority and lifecycle. Categories come from one
universal two-level taxonomy (`src/lib/taxonomy.ts`), and each finding's
reference is issued from it: `Indexation/Canonicals/2`. Because the record is fixed,
one finding can be sorted by score, filtered to an owner, grouped by template,
counted by band, and exported to four formats without being retyped.

The document is a view of the register, not the other way round.

## Checklists

An audit can carry a checklist: what it set out to look at. A check is not a
finding. It is written as the healthy state and answered pass, fail or not
applicable, and only a fail raises a finding, with its category, reference and
first measurement filled in from the check. That is what lets an audit report
coverage ("62 of 67 checks run") and print what came back clean.

- **Library.** The universal checks live in `src/lib/checks.ts`, filed on the
  same taxonomy as findings. A key is never renamed or reused.
- **Presets.** A named, pre-ticked selection of the library. Technical ships.
- **Templates.** A workspace's saved selection plus any checks it wrote, at
  `/templates`. Stored as a snapshot and copied into each audit, so editing a
  template never changes an audit that already used it.

Checklists are optional. An audit without one behaves exactly as before.

## Stack

- **Supabase** for Postgres, OAuth, row level security and evidence storage
- **React + Vite + TypeScript**, no server of its own
- **Cloudflare Workers** (static assets) at `auditbuilder.jakelabate.com`

## Exports

| Format | How it works |
|---|---|
| **JSON** | The full nested record, grouped exactly like the schema |
| **CSV** | The flat register projection, stable column order |
| **PDF** | The browser's own print engine against `src/export/print.css.ts`, which uses `@page` and mm units. No rendering service and no cost |
| **Google Sheets** | Creates a new sheet in the user's Drive using the `drive.file` scope only, which Google classifies as non-sensitive: the app can only touch files it created |

### Designs

How an export looks is a design. There are five for the document (Classic,
Editorial, Bold, Minimal, Dossier) and three for the register (Classic, Ledger,
Grid), listed in `src/lib/designs.ts`.

- **Same information.** A document design is a stylesheet in
  `src/export/designs.css.ts`, laid over the one set of pages `pdf.ts` builds.
  A register design is a set of colours and switches in `src/lib/sheettheme.ts`,
  read by the one exporter in `sheets.ts`. Neither can leave a field out,
  because neither builds the content. Every design keeps one finding to a page
  and leaves out any part with nothing in it.
- **On brand.** Every colour and face comes from the brand kit. The logo always
  sits on the brand colour, which is the ground it was chosen against.
- **Three levels.** `export_design` on the workspace, the brand and the audit,
  each `{"pdf": "...", "sheet": "..."}` with either key optional. The audit
  wins, then the brand, then the workspace, and a level that chose nothing
  stores nothing and follows the one above. Set on `/designs`, on the brand
  page, and in the export dialog. Over the API or MCP it is an ordinary field
  on a brand or audit patch.
- **Adding one.** Add the key and its description to `src/lib/designs.ts`, then
  its stylesheet or its theme. The pickers, the previews and the export dialog
  read the list, so nothing else changes.

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

## MCP and the API

The worker in `api/` serves both. The MCP address is
`https://mcp.jakelabate.com/auditbuilder`, passed through to it by the `mcp`
worker on that host. An MCP client signs in with the person's
AuditBuilder account through Supabase's OAuth 2.1 server and approves the
connection on `/oauth/consent`; the REST API takes a workspace key. Setup and
the full flow are in `api/README.md`.

## Layout

```
src/
  lib/       supabase client, types mirroring the schema, the score formula, data access
  pages/     Login, Brands, BrandView, Audits, AuditView, Templates, Designs, McpPage (MCP, then the REST API), OAuthConsent
  components/ Chrome, FindingEditor, Checklist, ChecklistBuilder, DesignPicker
  export/    serialize (JSON + CSV), pdf, print.css, designs.css, sheets
supabase/    schema notes and how to pull the migrations
```

## Two rules worth keeping

**`impact_basis` is required whenever a quantity is asserted.** The editor
refuses to call a finding complete without it. Every number the document
prints has to say where it came from.

**`verification_method` is written before the fix, not after.** It is what
makes the register still useful six months later.
