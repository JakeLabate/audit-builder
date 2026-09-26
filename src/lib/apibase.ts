/** One place that knows where the worker lives. */
export const API_BASE = 'https://audit-api.jake-a-labate.workers.dev'
export const RENDER_URL = `${API_BASE}/render`
export const MCP_URL = `${API_BASE}/mcp`

export interface ApiIndex {
  name: string
  auth: string
  mcp: string
  render?: string
  scopes?: string[]
  tools?: { name: string; description: string }[]
  routes: string[]
}

/** The worker describes itself. Reading it here keeps this page honest: if a
 *  route or a tool is added, the documentation follows without anyone
 *  remembering to update it. */
export async function fetchApiIndex(): Promise<ApiIndex> {
  const res = await fetch(API_BASE, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`The API answered ${res.status}.`)
  return (await res.json()) as ApiIndex
}
