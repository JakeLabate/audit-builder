import { useEffect, useState } from 'react'
import { currentOrg } from '../lib/api'
import ChecklistBuilder, { type BuilderResult } from '../components/ChecklistBuilder'
import { PRESETS, groupByPath, presetRef, specsFor, type AuditTemplate, type CheckSpec } from '../lib/checks'
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from '../lib/checkdata'

/**
 * Saved checklists.
 *
 * A template is a list of what an audit should look at, and nothing more. It
 * holds no findings and writes none: starting an audit from a template copies
 * its checks in, and from then on the audit owns its copy. Editing or deleting
 * a template never reaches back into an audit that already used it.
 */
export default function Templates() {
  const [org, setOrg] = useState<{ id: string } | null>(null)
  const [templates, setTemplates] = useState<AuditTemplate[] | null>(null)
  const [edit, setEdit] = useState<{ template: AuditTemplate | null; base: string | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setOrg(await currentOrg())
        setTemplates(await listTemplates())
      } catch (e) {
        setErr((e as Error).message)
        setTemplates([])
      }
    })()
  }, [])

  async function save(r: BuilderResult) {
    if (!org || !edit || !r.name) return
    if (edit.template) {
      await updateTemplate(edit.template.id, { name: r.name, checks: r.specs })
      setTemplates((p) => (p ?? []).map((t) => (t.id === edit.template!.id ? { ...t, name: r.name!, checks: r.specs } : t))
        .sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      const t = await createTemplate(org.id, r.name, r.specs)
      setTemplates((p) => [...(p ?? []), t].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setEdit(null)
  }

  async function remove(t: AuditTemplate) {
    if (!confirm(`Delete the ${t.name} template? Audits already started from it keep their checks.`)) return
    try {
      await deleteTemplate(t.id)
      setTemplates((p) => (p ?? []).filter((x) => x.id !== t.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const spread = (specs: CheckSpec[]) => groupByPath(specs).map((g) => `${g.category} ${g.count}`).join(' · ')

  return (
    <div className="wrap">
      <h1 className="page">Templates</h1>
      <p className="sub">
        A template is a checklist: what an audit sets out to look at. Start an audit from one and
        every check is marked pass, fail or not applicable, so the audit can show what came back
        clean as well as what did not. Only a failed check raises a finding.
      </p>

      {err && <div className="issue"><b>Something went wrong</b>{err}</div>}

      <div className="bar">
        <button className="btn pri" onClick={() => setEdit({ template: null, base: presetRef(PRESETS[0].id) })}>
          New template
        </button>
      </div>

      <h2 className="tpl-h">Yours</h2>
      {templates === null ? (
        <span className="saving">Loading</span>
      ) : templates.length === 0 ? (
        <div className="empty">
          <b>No templates yet</b>
          <span>Build one here, or save the checklist of any audit as a template from its Checklist tab.</span>
        </div>
      ) : (
        <div className="cards">
          {templates.map((t) => (
            <div className="card" key={t.id}>
              <h3>{t.name}</h3>
              <div className="meta">{t.checks.length} {t.checks.length === 1 ? 'check' : 'checks'}</div>
              <p className="tpl-spread">{spread(t.checks) || 'Empty'}</p>
              <div className="row2">
                <button className="btn sm" onClick={() => setEdit({ template: t, base: null })}>Edit</button>
                <button className="btn sm danger" onClick={() => remove(t)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="tpl-h">Presets</h2>
      <div className="cards">
        {PRESETS.map((p) => (
          <div className="card" key={p.id}>
            <h3>{p.name} <span className="modetag">Preset</span></h3>
            <div className="meta">{p.keys.length} checks</div>
            <p className="tpl-spread">{p.what}</p>
            <p className="tpl-spread">{spread(specsFor(presetRef(p.id), []))}</p>
            <div className="row2">
              <button className="btn sm" onClick={() => setEdit({ template: null, base: presetRef(p.id) })}>
                Copy and customize
              </button>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <ChecklistBuilder
          mode="template"
          templates={templates ?? []}
          base={edit.base}
          editing={edit.template}
          onClose={() => setEdit(null)}
          onDone={save}
        />
      )}
    </div>
  )
}
