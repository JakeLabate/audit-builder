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

  // A browser costs real allowance, and the worker has no memory between
  // requests, so the counting happens in the database where a race cannot
  // let two callers both believe they were under the limit.
  const gate = await rateLimit(env, org, body.audit_id)
  if (!gate.allowed) {
    return new Response(JSON.stringify({
      error: `This workspace has rendered ${gate.used_hour} documents in the last hour and `
        + `${gate.used_day} today, which is the limit. Try again in `
        + `${Math.ceil(gate.retry_after_seconds / 60)} minutes.`,
      retry_after_seconds: gate.retry_after_seconds,
    }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': String(gate.retry_after_seconds) },
    })
  }

  const pdf = await toPdf(env, body.html)

  const name = safeName(body.filename ?? 'report')
  const path = `${org}/${body.audit_id}/${crypto.randomUUID()}/${name}.pdf`
  await putObject(env, path, pdf)

  // A path, not a URL. The bucket is private, so a link is signed by the app
  // when somebody actually asks to share one, and lasts as long as that share
  // needs rather than for ever.
  return Response.json({ path, bytes: pdf.byteLength })
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

interface Gate { allowed: boolean; used_hour: number; used_day: number; retry_after_seconds: number }

async function rateLimit(env: Env, org: string, auditId: string): Promise<Gate> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/render_allow`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_org: org, p_user: null, p_audit: auditId }),
  })
  // A limiter that fails closed would make a database hiccup look like a
  // broken export. It fails open and the allowance absorbs it.
  if (!res.ok) return { allowed: true, used_hour: 0, used_day: 0, retry_after_seconds: 0 }
  const rows = (await res.json().catch(() => [])) as Gate[]
  return rows?.[0] ?? { allowed: true, used_hour: 0, used_day: 0, retry_after_seconds: 0 }
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
