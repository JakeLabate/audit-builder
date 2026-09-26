import { ApiError, type Env } from './db'

/**
 * Render a document to PDF.
 *
 * The browser print dialog produces a file the app never sees, which is why an
 * export used to leave nothing behind. Cloudflare's headless browser prints the
 * same HTML with the same engine, and hands back bytes we can store and link.
 *
 * Authenticated by the caller's Supabase access token rather than an API key,
 * because the caller is the app in someone's browser. An open renderer is an
 * open proxy, so the token is verified and the audit is checked against the
 * user's own membership before a browser is ever launched.
 */

interface RenderEnv extends Env {
  BROWSER: Fetcher
}

const PAGE = { width: '210mm', height: '297mm' }

export async function handleRender(req: Request, env: RenderEnv): Promise<Response> {
  if (req.method !== 'POST') throw new ApiError(405, 'POST a document to render it.')

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new ApiError(401, 'Send your Supabase access token as a bearer token.')

  const body = (await req.json().catch(() => null)) as {
    audit_id?: string; html?: string; filename?: string
  } | null
  if (!body?.audit_id || !body?.html) throw new ApiError(400, 'Send audit_id and html.')
  if (body.html.length > 8_000_000) throw new ApiError(413, 'That document is too large to render.')

  const org = await orgForUser(env, token, body.audit_id)

  const pdf = await toPdf(env, body.html)

  const name = safeName(body.filename ?? 'report')
  const path = `${org}/${body.audit_id}/${crypto.randomUUID()}/${name}.pdf`
  await putObject(env, path, pdf)

  return Response.json({
    path,
    url: `${env.SUPABASE_URL}/storage/v1/object/public/audit-docs/${path}`,
    bytes: pdf.byteLength,
  })
}

/** The token has to belong to somebody who can already see this audit. */
async function orgForUser(env: Env, token: string, auditId: string): Promise<string> {
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  })
  if (!who.ok) throw new ApiError(401, 'That access token is not valid.')

  // Read the audit as the user, not as the service role, so row level security
  // answers the membership question rather than this worker guessing at it.
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/audits?id=eq.${encodeURIComponent(auditId)}&select=org_id`,
    { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY } },
  )
  const rows = (await res.json().catch(() => [])) as { org_id?: string }[]
  const org = rows?.[0]?.org_id
  if (!org) throw new ApiError(404, 'No audit with that id, or you cannot see it.')
  return org
}

async function toPdf(env: RenderEnv, html: string): Promise<Uint8Array> {
  const puppeteer = await import('@cloudflare/puppeteer')
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    // networkidle0 covers the webfonts. The document carries its own fit pass
    // and sets data-fit once it has run, so the wait below is for that, not a
    // guess at a duration.
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForSelector('html[data-fit="done"]', { timeout: 20_000 }).catch(() => {})
    return (await page.pdf({
      ...PAGE, printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })) as Uint8Array
  } finally {
    await browser.close()
  }
}

async function putObject(env: Env, path: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/audit-docs/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: bytes as unknown as BodyInit,
  })
  if (!res.ok) throw new ApiError(502, `The document rendered but could not be stored. ${await res.text()}`)
}

const safeName = (s: string) =>
  s.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'report'
