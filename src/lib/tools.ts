import { supabase } from './supabase'

/**
 * The tools a measurement can come from. A universal list every workspace
 * shares, plus whatever a workspace adds, which every member then sees in
 * every audit. Stored on a measurement row as "Tool › Report".
 */
export const SEP = ' › '

export const PRESET_TOOLS: Record<string, string[]> = {
  'Search Console': ['Performance', 'Pages', 'URL Inspection', 'Merchant listings', 'Legacy reports'],
  'PageSpeed Insights': ['Field (CrUX)', 'Lab'],
  'Screaming Frog': ['Crawl', 'Custom extraction', 'Hreflang', 'Near duplicates', 'Orphans'],
  'Google Analytics 4': ['Reports'],
  'Server logs': ['Bot requests'],
  'Chrome DevTools': ['Performance trace', 'Network', 'Rendered DOM'],
  'Rich Results Test': ['Live test'],
  'Schema.org Validator': ['Validation'],
  'Manual review': ['Browser', 'Search results'],
}

export interface WorkspaceTool {
  id: string
  org_id: string
  parent: string
  name: string
  archived_at: string | null
}

export const toolPath = (parent: string, name: string) => `${parent}${SEP}${name}`
export const toolGroup = (path: string) => path.split(SEP)[0]

/** Preset and workspace entries merged into one grouped list. */
export function toolGroups(mine: WorkspaceTool[]): { group: string; items: { path: string; name: string; yours: boolean }[] }[] {
  const live = mine.filter((t) => !t.archived_at)
  const groups = [...new Set([...Object.keys(PRESET_TOOLS), ...live.map((t) => t.parent)])]
  return groups.map((g) => ({
    group: g,
    items: [
      ...(PRESET_TOOLS[g] ?? []).map((n) => ({ path: toolPath(g, n), name: n, yours: false })),
      ...live.filter((t) => t.parent === g).map((t) => ({ path: toolPath(g, t.name), name: t.name, yours: true })),
    ],
  }))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The listed entry a new name is close to, so the 23 spellings do not come back. */
export function nearestTool(name: string, mine: WorkspaceTool[]): string | null {
  const n = norm(name)
  if (n.length < 3) return null
  for (const { group, items } of toolGroups(mine)) {
    const g = norm(group)
    if (g.includes(n) || n.includes(g)) return group
    for (const it of items) if (norm(it.name) === n) return it.path
  }
  return null
}

export async function listWorkspaceTools(): Promise<WorkspaceTool[]> {
  const { data, error } = await supabase
    .from('tools').select('id, org_id, parent, name, archived_at').order('parent').order('name')
  if (error) throw error
  return data ?? []
}

/** A new tool with no report of its own is filed as Tool › General. */
export async function addWorkspaceTool(orgId: string, parent: string, name: string): Promise<WorkspaceTool> {
  const { data, error } = await supabase
    .from('tools').insert({ org_id: orgId, parent, name }).select('id, org_id, parent, name, archived_at').single()
  if (error) throw error
  return data
}

/** Sources are the distinct tools the rows used, in the order they first appear. */
export function sourcesFrom(rows: { tool?: string | null }[]): string[] {
  return [...new Set(rows.map((r) => r.tool).filter((t): t is string => !!t).map(toolGroup))]
}
