import { useMemo, useState } from 'react'
import {
  LIBRARY, PRESETS, groupByPath, libraryCheck, nameFor, presetRef, specId, specsFor,
  type AuditTemplate, type CheckSpec,
} from '../lib/checks'

/**
 * The checklist picker.
 *
 * One tree, three levels, a tick at each: a category, a subcategory, a check.
 * Tick a category to take everything in it, or open it and pick. A preset is
 * the same tree arriving with ticks already in it, so "start from Technical
 * and drop International" is two clicks rather than a separate feature.
 *
 * The tree is the universal library plus whatever checks the workspace has
 * written for itself. Every category is listed even when the library has
 * nothing filed under it yet, because that is where a workspace's own checks
 * go.
 *
 * Used three ways: to start an audit, to build or edit a saved template, and
 * to add checks to an audit that is already running.
 */

export type BuilderMode = 'audit' | 'template' | 'add'

export interface BuilderResult {
  specs: CheckSpec[]
  /** The template's name, in template mode. */
  name: string | null
  /** In audit mode: also save the selection as a template under this name. */
  saveAs: string | null
  /** What it was started from, by name, for the audit's label. */
  baseName: string | null
}

const HEAD: Record<BuilderMode, [string, string]> = {
  audit: ['Checklist for the new audit', 'What this audit sets out to look at. Tick a category to take everything in it, or open it and pick.'],
  template: ['Template', 'A saved checklist you can start any audit from. Tick a category to take everything in it, or open it and pick.'],
  add: ['Add checks', 'Tick what this audit should also look at. What it already has is ticked and locked.'],
}

export default function ChecklistBuilder({
  mode, templates, base = null, editing = null, have = [], onClose, onDone,
}: {
  mode: BuilderMode
  templates: AuditTemplate[]
  /** Where the ticks start: preset:<id>, a template id, or nothing. */
  base?: string | null
  /** A saved template being edited. */
  editing?: AuditTemplate | null
  /** Add mode: what the audit already has. */
  have?: CheckSpec[]
  onClose: () => void
  onDone: (r: BuilderResult) => Promise<void>
}) {
  const start = (ref: string | null) => (editing ? editing.checks : specsFor(ref, templates))
  // A spec the library does not know is the workspace's own: either written
  // by hand, or a library check that has since been retired. Both stay in the
  // tree exactly as the template stored them.
  const ownOf = (specs: CheckSpec[]) => specs.filter((s) => !libraryCheck(s.key))

  const [from, setFrom] = useState<string>(base ?? '')
  const [own, setOwn] = useState<CheckSpec[]>(() => ownOf(start(base)))
  const [on, setOn] = useState<Set<string>>(() => new Set(start(base).map(specId)))
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [name, setName] = useState(editing?.name ?? '')
  const [saveToo, setSaveToo] = useState(false)
  const [adding, setAdding] = useState<{ path: string; title: string; pass: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const locked = useMemo(() => new Set(have.map(specId)), [have])
  const tree = useMemo(() => groupByPath([...LIBRARY, ...own], true), [own])
  const picked = useMemo(
    () => tree.flatMap((g) => g.subs.flatMap((s) => s.items))
      .filter((c) => on.has(specId(c)) && !locked.has(specId(c))),
    [tree, on, locked],
  )
  const cats = new Set(picked.map((c) => c.path.split('/')[0])).size

  function restart(ref: string) {
    setFrom(ref)
    const specs = specsFor(ref || null, templates)
    setOwn(ownOf(specs))
    setOn(new Set(specs.map(specId)))
    setErr(null)
  }

  /** Tick or clear a whole set at once. Locked ones are never touched. */
  function toggleMany(items: CheckSpec[]) {
    const ids = items.map(specId).filter((id) => !locked.has(id))
    const all = ids.length > 0 && ids.every((id) => on.has(id))
    setOn((p) => {
      const n = new Set(p)
      for (const id of ids) all ? n.delete(id) : n.add(id)
      return n
    })
  }

  const state = (items: CheckSpec[]) => {
    const ids = items.map(specId)
    const free = ids.filter((id) => !locked.has(id))
    const n = ids.filter((id) => on.has(id) || locked.has(id)).length
    return {
      n, m: ids.length,
      all: ids.length > 0 && n === ids.length,
      some: n > 0 && n < ids.length,
      disabled: free.length === 0,
    }
  }

  function addOwn() {
    if (!adding) return
    const title = adding.title.trim()
    if (!title) { setErr('Write the check as the healthy state, for example "Redirects resolve in one hop".'); return }
    const spec: CheckSpec = { key: null, path: adding.path, title, tool: null, pass: adding.pass.trim() || null }
    if ([...LIBRARY, ...own].some((c) => c.path === spec.path && c.title.trim().toLowerCase() === title.toLowerCase())) {
      setErr('That check is already listed here.'); return
    }
    setOwn((p) => [...p, spec])
    setOn((p) => new Set(p).add(specId(spec)))
    setAdding(null); setErr(null)
  }

  function removeOwn(c: CheckSpec) {
    setOwn((p) => p.filter((x) => specId(x) !== specId(c)))
    setOn((p) => { const n = new Set(p); n.delete(specId(c)); return n })
  }

  async function done() {
    const nm = name.trim()
    if (picked.length === 0) { setErr('Nothing is ticked yet.'); return }
    if (mode === 'template' && !nm) { setErr('Name the template.'); return }
    if (mode === 'audit' && saveToo && !nm) { setErr('Name the template, or untick saving it.'); return }
    setBusy(true); setErr(null)
    try {
      await onDone({
        specs: picked,
        name: mode === 'template' ? nm : null,
        saveAs: mode === 'audit' && saveToo ? nm : null,
        baseName: editing?.name ?? nameFor(from || null, templates),
      })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const [title, sub] = HEAD[mode]
  const canPickBase = !editing && (mode !== 'add' || have.length === 0)
  const action = mode === 'audit' ? 'Create audit'
    : mode === 'template' ? (editing ? 'Save changes' : 'Save template')
      : `Add ${picked.length} ${picked.length === 1 ? 'check' : 'checks'}`

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal cb" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-hd">
          <div>
            <h2>{mode === 'template' ? (editing ? 'Edit template' : 'New template') : title}</h2>
            <p>{sub}</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close" disabled={busy}>&times;</button>
        </header>

        {(canPickBase || mode === 'template') && (
          <div className="cb-top">
            {mode === 'template' && (
              <div className="fld">
                <label htmlFor="cb-name">Template name</label>
                <input id="cb-name" value={name} placeholder="Technical, ecommerce"
                  onChange={(e) => { setName(e.target.value); setErr(null) }} />
              </div>
            )}
            {canPickBase && (
              <div className="fld">
                <label htmlFor="cb-from">Start from</label>
                <select id="cb-from" value={from} onChange={(e) => restart(e.target.value)}>
                  <option value="">Nothing ticked</option>
                  <optgroup label="Presets">
                    {PRESETS.map((p) => (
                      <option key={p.id} value={presetRef(p.id)}>{p.name} · {p.keys.length} checks</option>
                    ))}
                  </optgroup>
                  {templates.length > 0 && (
                    <optgroup label="Your templates">
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} · {t.checks.length} checks</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="cb-tree">
          {tree.map((g) => {
            const items = g.subs.flatMap((s) => s.items)
            const st = state(items)
            const isOpen = open.has(g.category)
            return (
              <section key={g.category} className="cb-grp">
                <div className="cb-cat">
                  <input type="checkbox" className="cb-box" checked={st.all} disabled={st.disabled}
                    ref={(el) => { if (el) el.indeterminate = st.some }}
                    onChange={() => toggleMany(items)}
                    aria-label={`Every check in ${g.category}`} />
                  <button type="button" className="cb-catbtn" aria-expanded={isOpen}
                    onClick={() => setOpen((p) => { const n = new Set(p); n.has(g.category) ? n.delete(g.category) : n.add(g.category); return n })}>
                    <span className="cb-caret" aria-hidden="true" />
                    <span>{g.category}</span>
                    <span className="cb-n">{st.m ? `${st.n} of ${st.m}` : 'Add your own'}</span>
                  </button>
                </div>

                {isOpen && g.subs.map((s) => {
                  const ss = state(s.items)
                  return (
                    <div key={s.path} className="cb-sub">
                      {/* Nothing filed here yet, so there is nothing to tick: the
                          heading stays, as the place a check of your own goes. */}
                      {ss.m === 0 ? (
                        <div className="cb-subhd bare"><span>{s.sub}</span></div>
                      ) : (
                        <label className="cb-subhd">
                          <input type="checkbox" className="cb-box" checked={ss.all} disabled={ss.disabled}
                            ref={(el) => { if (el) el.indeterminate = ss.some }}
                            onChange={() => toggleMany(s.items)} />
                          <span>{s.sub}</span>
                          <span className="cb-n">{ss.n} of {ss.m}</span>
                        </label>
                      )}

                      {s.items.map((c) => {
                        const id = specId(c)
                        const isLocked = locked.has(id)
                        const mine = !libraryCheck(c.key)
                        return (
                          <div key={id} className="cb-check">
                            <label>
                              <input type="checkbox" className="cb-box" checked={isLocked || on.has(id)} disabled={isLocked}
                                onChange={() => toggleMany([c])} />
                              <span className="cb-t">
                                {c.title}
                                {mine && <em className="cb-own">yours</em>}
                                {isLocked && <em className="cb-own">already in this audit</em>}
                                {c.pass && <span className="cb-p">{c.pass}</span>}
                              </span>
                            </label>
                            {mine && !isLocked && (
                              <button type="button" className="btn sm ghost" onClick={() => removeOwn(c)}
                                aria-label={`Remove ${c.title}`}>Remove</button>
                            )}
                          </div>
                        )
                      })}

                      {adding?.path === s.path ? (
                        <div className="cb-add">
                          <input autoFocus value={adding.title} placeholder="The check, written as the healthy state"
                            aria-label="Your check"
                            onChange={(e) => { setAdding({ ...adding, title: e.target.value }); setErr(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') addOwn() }} />
                          <input value={adding.pass} placeholder="Passes when (optional)" aria-label="Passes when"
                            onChange={(e) => setAdding({ ...adding, pass: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') addOwn() }} />
                          <div className="cb-add-b">
                            <button type="button" className="btn sm" onClick={() => { setAdding(null); setErr(null) }}>Cancel</button>
                            <button type="button" className="btn sm pri" onClick={addOwn}>Add check</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn sm ghost cb-addbtn"
                          onClick={() => { setAdding({ path: s.path, title: '', pass: '' }); setErr(null) }}>
                          + Add your own check
                        </button>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        {err && <p className="cb-err" role="alert">{err}</p>}

        <footer className="modal-ft cb-ft">
          <span className="cb-count">
            <b>{picked.length}</b> {picked.length === 1 ? 'check' : 'checks'}
            {picked.length > 0 && ` across ${cats} ${cats === 1 ? 'category' : 'categories'}`}
          </span>
          {mode === 'audit' && (
            <div className="cb-save">
              <label>
                <input type="checkbox" className="cb-box" checked={saveToo} onChange={() => setSaveToo((v) => !v)} />
                <span>Save as a template</span>
              </label>
              {saveToo && (
                <input value={name} placeholder="Template name" aria-label="Template name"
                  onChange={(e) => { setName(e.target.value); setErr(null) }} />
              )}
            </div>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn pri" onClick={done} disabled={busy || picked.length === 0}>
            {busy ? 'Saving' : action}
          </button>
        </footer>
      </div>
    </div>
  )
}
