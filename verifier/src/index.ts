/**
 * The verifier. Runs on a schedule, pulls findings that carry acceptance
 * checks, fetches the pages, tests each condition, and hands the result back
 * to Postgres. The database decides what the result means for the finding's
 * status; this worker only reports what it saw.
 *
 * No dependencies. HTMLRewriter does the selector work.
 */

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  /** Shared secret for the manual trigger endpoint. */
  VERIFIER_KEY: string
  /** Findings per scheduled run. Optional, defaults to 40. */
  BATCH?: string
}

type CheckKind =
  | 'http_status' | 'redirect_to' | 'header' | 'canonical'
  | 'selector_present' | 'selector_absent' | 'selector_text'
  | 'json_ld_type' | 'robots_allows' | 'robots_disallows'

interface Check {
  kind: CheckKind
  url: string
  selector?: string
  expected?: string
  note?: string
}

interface Outcome {
  kind: CheckKind
  url: string
  pass: boolean
  observed: string | null
  expected: string | null
}

interface QueueRow {
  id: string
  ref: string
  acceptance_checks: Check[]
  last_check_at: string | null
  status: string
}

const UA = 'Mozilla/5.0 (compatible; AuditBuilderVerifier/1.0; +https://auditbuilder.jakelabate.com)'

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBatch(env, Number(env.BATCH ?? 40), null))
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/run') {
      if (req.headers.get('x-verifier-key') !== env.VERIFIER_KEY) {
        return new Response('forbidden', { status: 403 })
      }
      const finding = url.searchParams.get('finding')
      const results = await runBatch(env, finding ? 1 : Number(env.BATCH ?? 40), finding)
      return Response.json(results)
    }
    return new Response('audit-builder verifier', { status: 200 })
  },
}

async function runBatch(env: Env, limit: number, finding: string | null) {
  const queue = await rpc<QueueRow[]>(env, 'verifier_queue', { p_limit: limit, p_finding: finding })
  const out: { id: string; ref: string; pass: boolean }[] = []
  for (const row of queue) {
    const result = await verify(row.acceptance_checks)
    await rpc(env, 'verifier_record', { p_finding: row.id, p_result: result })
    out.push({ id: row.id, ref: row.ref, pass: result.pass })
  }
  return out
}

async function rpc<T = unknown>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** Every check runs even after one fails, so the report is complete. */
async function verify(checks: Check[]): Promise<{ pass: boolean; checks: Outcome[]; error?: string }> {
  const outcomes: Outcome[] = []
  for (const c of checks) {
    try {
      outcomes.push(await runCheck(c))
    } catch (e) {
      outcomes.push({
        kind: c.kind, url: c.url, pass: false,
        observed: `error: ${(e as Error).message}`, expected: c.expected ?? null,
      })
    }
  }
  return { pass: outcomes.length > 0 && outcomes.every((o) => o.pass), checks: outcomes }
}

// ---------------------------------------------------------------- checks

async function runCheck(c: Check): Promise<Outcome> {
  const base = { kind: c.kind, url: c.url, expected: c.expected ?? null }
  switch (c.kind) {
    case 'http_status': {
      const res = await get(c.url, 'manual')
      const want = Number(c.expected || 200)
      return { ...base, pass: res.status === want, observed: String(res.status), expected: String(want) }
    }
    case 'redirect_to': {
      const final = await follow(c.url)
      const pass = sameUrl(final, c.expected ?? '')
      return { ...base, pass, observed: final }
    }
    case 'header': {
      const res = await get(c.url, 'follow')
      const name = (c.selector ?? '').toLowerCase()
      const val = res.headers.get(name)
      const pass = val != null && (c.expected ? val.toLowerCase().includes(c.expected.toLowerCase()) : true)
      return { ...base, pass, observed: val, expected: `${name}: ${c.expected ?? '(present)'}` }
    }
    case 'canonical': {
      const res = await get(c.url, 'follow')
      let href: string | null = null
      await new HTMLRewriter()
        .on('link[rel="canonical"]', { element(el) { href = href ?? el.getAttribute('href') } })
        .transform(res).text()
      const abs = href ? resolve(href, c.url) : null
      return { ...base, pass: abs != null && sameUrl(abs, c.expected ?? ''), observed: abs }
    }
    case 'selector_present':
    case 'selector_absent': {
      const res = await get(c.url, 'follow')
      let n = 0
      await new HTMLRewriter().on(c.selector ?? '*', { element() { n++ } }).transform(res).text()
      const present = n > 0
      return {
        ...base,
        pass: c.kind === 'selector_present' ? present : !present,
        observed: `${n} match${n === 1 ? '' : 'es'}`,
        expected: c.kind === 'selector_present' ? 'at least one' : 'none',
      }
    }
    case 'selector_text': {
      const res = await get(c.url, 'follow')
      let text = ''
      await new HTMLRewriter()
        .on(c.selector ?? '*', { text(t) { text += t.text } })
        .transform(res).text()
      const norm = text.replace(/\s+/g, ' ').trim()
      const pass = norm.toLowerCase().includes((c.expected ?? '').toLowerCase())
      return { ...base, pass, observed: norm.slice(0, 200) || null }
    }
    case 'json_ld_type': {
      const res = await get(c.url, 'follow')
      const blocks: string[] = []
      let cur = ''
      await new HTMLRewriter()
        .on('script[type="application/ld+json"]', {
          element(el) { cur = ''; el.onEndTag(() => { blocks.push(cur) }) },
          text(t) { cur += t.text },
        })
        .transform(res).text()
      const types = new Set<string>()
      for (const b of blocks) {
        try { collectTypes(JSON.parse(b), types) } catch { /* malformed block, skip it */ }
      }
      const want = (c.expected ?? '').toLowerCase()
      const pass = [...types].some((t) => t.toLowerCase() === want)
      return { ...base, pass, observed: [...types].join(', ') || null }
    }
    case 'robots_allows':
    case 'robots_disallows': {
      const u = new URL(c.url)
      const robots = await get(`${u.origin}/robots.txt`, 'follow')
      const body = robots.ok ? await robots.text() : ''
      const allowed = robotsAllows(body, c.expected || '*', u.pathname + u.search)
      return {
        ...base,
        pass: c.kind === 'robots_allows' ? allowed : !allowed,
        observed: robots.ok ? (allowed ? 'allowed' : 'blocked') : `robots.txt ${robots.status}`,
        expected: c.kind === 'robots_allows' ? 'allowed' : 'blocked',
      }
    }
  }
}

// ---------------------------------------------------------------- helpers

async function get(url: string, redirect: 'follow' | 'manual'): Promise<Response> {
  return fetch(url, {
    redirect,
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit)
}

/** Final URL after up to five hops, without following into a loop. */
async function follow(url: string): Promise<string> {
  let cur = url
  for (let i = 0; i < 5; i++) {
    const res = await get(cur, 'manual')
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      cur = resolve(loc, cur)
      continue
    }
    return cur
  }
  return cur
}

function resolve(href: string, base: string): string {
  try { return new URL(href, base).toString() } catch { return href }
}

/** Equal after dropping a trailing slash and the fragment. Query strings count. */
function sameUrl(a: string, b: string): boolean {
  const n = (s: string) => {
    try {
      const u = new URL(s)
      u.hash = ''
      return u.toString().replace(/\/$/, '').toLowerCase()
    } catch {
      return s.trim().replace(/\/$/, '').toLowerCase()
    }
  }
  return n(a) === n(b)
}

function collectTypes(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, out)); return }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    const t = o['@type']
    if (typeof t === 'string') out.add(t)
    else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.add(x))
    if (o['@graph']) collectTypes(o['@graph'], out)
    // Nested entities (mainEntity, itemListElement, ...) carry their own @type.
    for (const [k, v] of Object.entries(o)) {
      if (k !== '@graph' && v && typeof v === 'object') collectTypes(v, out)
    }
  }
}

/**
 * Minimal robots.txt evaluation: pick the most specific user-agent group,
 * apply the longest matching Allow/Disallow, treat * and $ as in Google's
 * spec. Good enough for verifying a rule was added or removed.
 */
function robotsAllows(body: string, agent: string, path: string): boolean {
  type Rule = { allow: boolean; pattern: string }
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let cur: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const key = m[1].toLowerCase()
    const val = m[2].trim()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      cur.rules.push({ allow: key === 'allow', pattern: val })
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }
  const a = agent.toLowerCase()
  const group =
    groups.find((g) => g.agents.some((x) => x !== '*' && a.includes(x))) ??
    groups.find((g) => g.agents.includes('*'))
  if (!group) return true
  let best: Rule | null = null
  for (const r of group.rules) {
    if (!r.pattern) continue
    if (matchRule(r.pattern, path)) {
      if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) {
        best = r
      }
    }
  }
  return best ? best.allow : true
}

function matchRule(pattern: string, path: string): boolean {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  const re = new RegExp('^' + (esc.endsWith('\\$') ? esc.slice(0, -2) + '$' : esc))
  return re.test(path)
}
