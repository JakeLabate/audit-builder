import { useEffect, useMemo, useState } from 'react'
import type { Audit, FindingFull } from '../lib/types'
import {
  coverage, coverageLine, groupByPath, type AuditCheck, type CheckStatus,
} from '../lib/checks'

/**
 * The audit's checklist: what it set out to look at, and how each check came
 * out.
 *
 * A check has three answers. Pass and Not applicable are the end of it. Fail
 * asks for the finding, stated as a claim, and that finding is written into
 * the register with its category, reference and first measurement already
 * filled in from the check. Nothing is turned into a finding automatically:
 * a check says where to look, the claim is still the consultant's to make.
 */

export type CheckFilter = 'all' | 'todo' | 'fail'

const ANSWERS: [CheckStatus, string][] = [['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']]

export default function Checklist({
  audit, checks, findings, category, filter, onStatus, onNote, onRaise, onRemove, onOpenFinding, onAdd, onSaveTemplate,
}: {
  audit: Audit
  checks: AuditCheck[]
  findings: FindingFull[]
  /** Show one category, or all of them. */
  category: string | null
  filter: CheckFilter
  onStatus: (k: AuditCheck, next: CheckStatus) => void
  onNote: (k: AuditCheck, note: string) => void
  onRaise: (k: AuditCheck, title: string) => Promise<void>
  onRemove: (k: AuditCheck) => void
  onOpenFinding: (id: string) => void
  onAdd: () => void
  onSaveTemplate: (name: string) => Promise<void>
}) {
  const cov = useMemo(() => coverage(checks), [checks])
  const [saving, setSaving] = useState<{ name: string; busy: boolean; err: string | null; done: boolean } | null>(null)

  if (checks.length === 0) {
    return (
      <div className="empty" style={{ marginTop: 40, maxWidth: 620 }}>
        <b>No checklist on this audit</b>
        <span>
          A checklist is what the audit sets out to look at. Each check is marked pass, fail or
          not applicable, so the audit can show what came back clean as well as what did not.
          It is optional: an audit works without one.
        </span>
        <div style={{ marginTop: 16 }}>
          <button className="btn pri" onClick={onAdd}>Add a checklist</button>
        </div>
      </div>
    )
  }

  const visible = checks.filter((k) =>
    (!category || k.path.split('/')[0] === category)
    && (filter === 'all' || k.status === filter))
  const groups = groupByPath(visible)
  const pct = (n: number) => `${(n / cov.total) * 100}%`

  async function save() {
    if (!saving) return
    const name = saving.name.trim()
    if (!name) { setSaving({ ...saving, err: 'Name the template.' }); return }
    setSaving({ ...saving, busy: true, err: null })
    try {
      await onSaveTemplate(name)
      setSaving({ name, busy: false, err: null, done: true })
    } catch (e) {
      setSaving({ name: saving.name, busy: false, err: (e as Error).message, done: false })
    }
  }

  return (
    <div className="ckl">
      <header className="ckl-hd">
        <h2>Checklist{audit.checklist_name ? <span className="ckl-src">{audit.checklist_name}</span> : null}</h2>
        <p className="ckl-sum">
          {coverageLine(cov)}
          {cov.fail > 0 && `. ${cov.findings} of ${cov.fail} failed ${cov.fail === 1 ? 'check has' : 'checks have'} a finding`}.
        </p>
        <div className="ckbar" role="img"
          aria-label={`${cov.pass} passed, ${cov.fail} failed, ${cov.na} not applicable, ${cov.todo} not checked`}>
          <i className="pass" style={{ width: pct(cov.pass) }} />
          <i className="fail" style={{ width: pct(cov.fail) }} />
          <i className="na" style={{ width: pct(cov.na) }} />
        </div>
        <div className="ckl-act">
          <button className="btn sm" onClick={onAdd}>Add checks</button>
          {!saving && (
            <button className="btn sm" onClick={() => setSaving({ name: audit.checklist_name ?? '', busy: false, err: null, done: false })}>
              Save as template
            </button>
          )}
          {saving && !saving.done && (
            <span className="ckl-save">
              <input autoFocus value={saving.name} placeholder="Template name" aria-label="Template name"
                onChange={(e) => setSaving({ ...saving, name: e.target.value, err: null })}
                onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />
              <button className="btn sm pri" disabled={saving.busy} onClick={() => void save()}>
                {saving.busy ? 'Saving' : 'Save'}
              </button>
              <button className="btn sm" disabled={saving.busy} onClick={() => setSaving(null)}>Cancel</button>
            </span>
          )}
          {saving?.done && <span className="saving">Saved as {saving.name}</span>}
        </div>
        {saving?.err && <p className="ferr">{saving.err}</p>}
      </header>

      {groups.length === 0 && (
        <div className="empty" style={{ marginTop: 24 }}>
          <b>{filter === 'todo' ? 'Nothing left to check' : filter === 'fail' ? 'Nothing has failed' : 'No checks here'}</b>
          <span>{category ? `In ${category}.` : 'Across the whole checklist.'}</span>
        </div>
      )}

      {groups.map((g) => {
        const c = coverage(checks.filter((k) => k.path.split('/')[0] === g.category))
        return (
          <section key={g.category} className="ckl-cat">
            <h3>{g.category}<span>{c.checked} of {c.total} checked</span></h3>
            {g.subs.map((s) => (
              <div key={s.path} className="ckl-sub">
                <h4>{s.sub}</h4>
                {s.items.map((k) => (
                  <CheckRow key={k.id} k={k}
                    finding={k.finding_id ? findings.find((f) => f.id === k.finding_id) ?? null : null}
                    onStatus={onStatus} onNote={onNote} onRaise={onRaise} onRemove={onRemove}
                    onOpenFinding={onOpenFinding} />
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function CheckRow({
  k, finding, onStatus, onNote, onRaise, onRemove, onOpenFinding,
}: {
  k: AuditCheck
  finding: FindingFull | null
  onStatus: (k: AuditCheck, next: CheckStatus) => void
  onNote: (k: AuditCheck, note: string) => void
  onRaise: (k: AuditCheck, title: string) => Promise<void>
  onRemove: (k: AuditCheck) => void
  onOpenFinding: (id: string) => void
}) {
  const [note, setNote] = useState(k.note ?? '')
  // Most checks pass and need nothing said about them, so the note stays out
  // of the way until someone wants one. A note that exists is always shown.
  const [noteOpen, setNoteOpen] = useState(false)
  const [claim, setClaim] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setNote(k.note ?? '') }, [k.note])

  async function raise() {
    const title = claim.trim()
    if (!title) { setErr('State what is wrong as a claim, for example "Category pages canonicalize to the home page".'); return }
    setBusy(true); setErr(null)
    try {
      await onRaise(k, title)
      setClaim('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`ck ${k.status}`}>
      <div className="ck-main">
        <div className="ck-t">{k.title}</div>
        {k.pass_criteria && <div className="ck-p">Passes when: {k.pass_criteria}</div>}
        {k.tool && <div className="ck-tool">{k.tool}</div>}
      </div>

      <div className="ck-side">
        <div className="ck-seg" role="group" aria-label={`Result for: ${k.title}`}>
          {ANSWERS.map(([s, label]) => (
            <button key={s} type="button" className={s} aria-pressed={k.status === s}
              onClick={() => onStatus(k, s)}>{label}</button>
          ))}
        </div>
        {/* Only a check nobody has answered can be dropped. Once it has a
            result it is part of what the audit says it looked at. */}
        {k.status === 'todo' && (
          <button type="button" className="ck-rm" onClick={() => onRemove(k)}
            aria-label={`Remove from this audit: ${k.title}`}>Remove</button>
        )}
      </div>

      {k.status !== 'todo' && (
        <div className="ck-more">
          {k.status === 'fail' && (finding ? (
            <div className="ck-find">
              <span className="mono">{finding.ref}</span>
              <span className="ck-find-t">{finding.title || 'Untitled finding'}</span>
              <button type="button" className="btn sm" onClick={() => onOpenFinding(finding.id)}>Open finding</button>
            </div>
          ) : (
            <div className="ck-claim">
              <label htmlFor={`claim-${k.id}`}>What is the finding? State it as a claim.</label>
              <div className="ck-claim-r">
                <input id={`claim-${k.id}`} value={claim} disabled={busy}
                  placeholder="What is wrong, in one sentence"
                  onChange={(e) => { setClaim(e.target.value); setErr(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void raise() }} />
                <button type="button" className="btn sm pri" disabled={busy} onClick={() => void raise()}>
                  {busy ? 'Creating' : 'Create finding'}
                </button>
              </div>
              {err && <p className="ferr">{err}</p>}
            </div>
          ))}
          {k.note || noteOpen ? (
            <input className="ck-note" value={note} aria-label={`Note for: ${k.title}`} autoFocus={noteOpen && !k.note}
              placeholder={k.status === 'na' ? 'Why it does not apply' : 'What came back'}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note.trim() !== (k.note ?? '')) onNote(k, note.trim())
                if (!note.trim()) setNoteOpen(false)
              }} />
          ) : (
            <button type="button" className="ck-rm ck-addnote" onClick={() => setNoteOpen(true)}>
              {k.status === 'na' ? 'Say why it does not apply' : 'Add a note'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
