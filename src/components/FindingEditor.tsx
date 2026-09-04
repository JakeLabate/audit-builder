import { useEffect, useRef, useState } from 'react'
import type { AffectedParty, Example, FindingFull, Measurement } from '../lib/types'
import { BAND_LABEL, missingRequirements, riskFactor, score, band } from '../lib/score'
import { createExample, deleteExample, deleteFinding, updateExample, updateFinding, uploadEvidence, evidenceUrl } from '../lib/api'

/** Debounced autosave. Editing forty fields with a Save button is a bad trade. */
function useAutosave(id: string, patch: Record<string, unknown>, enabled: boolean) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<number>()
  useEffect(() => {
    if (!enabled) return
    window.clearTimeout(timer.current)
    setState('saving')
    timer.current = window.setTimeout(async () => {
      try {
        await updateFinding(id, patch)
        setState('saved')
      } catch {
        setState('error')
      }
    }, 700)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(patch)])
  return state
}

const IMPACT_TYPES = ['duplicate_content','crawl_waste','lost_visibility','broken_experience','compliance_exposure'] as const
const HORIZONS = ['already_happening','next_crawl_cycle','next_release','latent'] as const
const PARTIES: AffectedParty[] = ['end_users','crawlers','internal_team']
const STATUSES = ['open','in_progress','fixed','verified','reopened','accepted_risk'] as const
const KINDS = ['page_element','markup','response','serp'] as const

export default function FindingEditor({
  finding, onChange, onDeleted,
}: {
  finding: FindingFull
  onChange: (f: FindingFull) => void
  onDeleted: () => void
}) {
  const f = finding
  const set = <K extends keyof FindingFull>(k: K, v: FindingFull[K]) => {
    const next = { ...f, [k]: v }
    next.score = score(next)
    next.band = band(next.score)
    next.risk_factor = riskFactor(next)
    onChange(next)
  }

  const savePatch = {
    ref: f.ref, title: f.title, pillar: f.pillar, urls_affected: f.urls_affected,
    templates: f.templates, markets: f.markets, measurements: f.measurements, source: f.source,
    collected_from: f.collected_from, collected_to: f.collected_to,
    confidence: f.confidence, confidence_reason: f.confidence_reason,
    impact_type: f.impact_type, metric_at_risk: f.metric_at_risk,
    quantity_value: f.quantity_value, quantity_unit: f.quantity_unit,
    impact_basis: f.impact_basis, time_horizon: f.time_horizon, affects: f.affects,
    action: f.action, steps: f.steps, owner: f.owner, effort_days: f.effort_days,
    dependencies: f.dependencies, wave: f.wave,
    blast_radius: f.blast_radius, failure_likelihood: f.failure_likelihood, reversibility: f.reversibility,
    severity_weight: f.severity_weight, reach: f.reach, confidence_factor: f.confidence_factor, leverage: f.leverage,
    status: f.status, verification_method: f.verification_method,
    verify_by: f.verify_by, verified_on: f.verified_on, closed_note: f.closed_note,
  }
  const saveState = useAutosave(f.id, savePatch, true)
  const issues = missingRequirements(f)

  const num = (v: string) => (v === '' ? null : Number(v))
  const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 className="ttl" style={{ flex: 1 }}>{f.title || 'Untitled finding'}</h2>
        <span className="saving">{saveState === 'saving' ? 'saving' : saveState === 'error' ? 'save failed' : 'saved'}</span>
      </div>
      <div className="idline">{f.ref} &nbsp;·&nbsp; {f.status.replace('_', ' ')}</div>

      <div className="scorebox">
        <div>
          <div className="n">{f.score ?? '--'}</div>
          <div className="l">{f.band ? `${f.band} / ${BAND_LABEL[f.band]}` : 'Not scored'}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="l">How it computes</div>
          <div className="why">
            ({f.severity_weight ?? '?'} x {f.reach ?? 1} x {f.confidence_factor ?? 1} x {f.leverage ?? 1})
            {' / '}sqrt({f.effort_days ?? '?'}) x {f.risk_factor}
          </div>
        </div>
      </div>

      {issues.map((m, i) => (
        <div className="issue" key={i}><b>Incomplete</b>{m}</div>
      ))}

      <G n={1} name="Identity" count={4} purpose="What this finding is. The reference never changes once issued, and the title is stated as a claim rather than a topic.">
        <div className="two">
          <F label="Reference"><input value={f.ref} onChange={(e) => set('ref', e.target.value)} /></F>
          <F label="Pillar"><input value={f.pillar ?? ''} onChange={(e) => set('pillar', e.target.value)} /></F>
        </div>
        <F label="Title, stated as a claim" lead>
          <input value={f.title} onChange={(e) => set('title', e.target.value)}
                 placeholder="The staging subdomain is fully indexed" />
        </F>
      </G>

      <G n={2} name="Scope" count={3} purpose="How much of the site it touches. A template-level issue is one fix; a page-level issue is many.">
        <div className="three">
          <F label="URLs affected">
            <input type="number" value={f.urls_affected ?? ''} onChange={(e) => set('urls_affected', num(e.target.value))} />
          </F>
          <F label="Templates" hint="comma separated">
            <input value={f.templates.join(', ')} onChange={(e) => set('templates', list(e.target.value))} />
          </F>
          <F label="Markets" hint="comma separated">
            <input value={f.markets.join(', ')} onChange={(e) => set('markets', list(e.target.value))} />
          </F>
        </div>
      </G>

      <G n={3} name="Evidence" count={5} purpose="How we know. Measurements are the numbers that support the claim; exhibits are what shows it.">
        <Measurements value={f.measurements} onChange={(v) => set('measurements', v)} />
        <div className="three">
          <F label="Sources" hint="comma separated">
            <input value={f.source.join(', ')} onChange={(e) => set('source', list(e.target.value))} />
          </F>
          <F label="Collected from">
            <input type="date" value={f.collected_from ?? ''} onChange={(e) => set('collected_from', e.target.value || null)} />
          </F>
          <F label="Collected to">
            <input type="date" value={f.collected_to ?? ''} onChange={(e) => set('collected_to', e.target.value || null)} />
          </F>
        </div>
        <div className="two">
          <F label="Confidence">
            <select value={f.confidence ?? ''} onChange={(e) => set('confidence', (e.target.value || null) as never)}>
              <option value="">not set</option><option>high</option><option>medium</option><option>low</option>
            </select>
          </F>
          <F label="Reason, if below high">
            <input value={f.confidence_reason ?? ''} onChange={(e) => set('confidence_reason', e.target.value)} />
          </F>
        </div>
        <Exhibits finding={f} onChange={onChange} />
      </G>

      <G n={4} name="Impact" count={6} purpose="What it costs. Any quantity asserted here has to state where it came from.">
        <div className="two">
          <F label="Impact type">
            <select value={f.impact_type ?? ''} onChange={(e) => set('impact_type', (e.target.value || null) as never)}>
              <option value="">not set</option>
              {IMPACT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </F>
          <F label="Metric at risk">
            <input value={f.metric_at_risk ?? ''} onChange={(e) => set('metric_at_risk', e.target.value)} />
          </F>
        </div>
        <div className="two">
          <F label="Quantity">
            <input type="number" value={f.quantity_value ?? ''} onChange={(e) => set('quantity_value', num(e.target.value))} />
          </F>
          <F label="Unit">
            <input value={f.quantity_unit ?? ''} onChange={(e) => set('quantity_unit', e.target.value)} placeholder="sessions_per_month" />
          </F>
        </div>
        <F label="Impact basis" required hint="One sentence saying where the quantity came from. No number ships without it.">
          <textarea value={f.impact_basis ?? ''} onChange={(e) => set('impact_basis', e.target.value)} />
        </F>
        <div className="two">
          <F label="Time horizon">
            <select value={f.time_horizon ?? ''} onChange={(e) => set('time_horizon', (e.target.value || null) as never)}>
              <option value="">not set</option>
              {HORIZONS.map((h) => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
            </select>
          </F>
          <F label="Affects">
            <div className="chiprow">
              {PARTIES.map((p) => (
                <button key={p} type="button"
                  className={`btn sm${f.affects.includes(p) ? ' pri' : ''}`}
                  onClick={() => set('affects', f.affects.includes(p) ? f.affects.filter((x) => x !== p) : [...f.affects, p])}>
                  {p.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </F>
        </div>
      </G>

      <G n={5} name="Remedy" count={6} purpose="What to do about it, written so a competent engineer can act without asking a follow-up question.">
        <F label="Action"><input value={f.action ?? ''} onChange={(e) => set('action', e.target.value)} /></F>
        <F label="Steps" hint="one per line">
          <textarea value={f.steps.join('\n')} onChange={(e) => set('steps', e.target.value.split('\n').filter((s) => s.trim()))} />
        </F>
        <div className="four">
          <F label="Owner"><input value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} /></F>
          <F label="Effort, days"><input type="number" step="0.5" value={f.effort_days ?? ''} onChange={(e) => set('effort_days', num(e.target.value))} /></F>
          <F label="Wave"><input type="number" value={f.wave ?? ''} onChange={(e) => set('wave', num(e.target.value))} /></F>
          <F label="Depends on" hint="refs, comma separated">
            <input value={f.dependencies.join(', ')} onChange={(e) => set('dependencies', list(e.target.value))} />
          </F>
        </div>
      </G>

      <G n={6} name="Risk and priority" count={8} purpose="What could go wrong fixing it, and the inputs the score is computed from. None of these are typed opinions about the score itself.">
        <div className="four">
          <F label="Blast radius, 1 to 3"><input type="number" min={1} max={3} value={f.blast_radius ?? ''} onChange={(e) => set('blast_radius', num(e.target.value))} /></F>
          <F label="Failure likelihood, 1 to 3"><input type="number" min={1} max={3} value={f.failure_likelihood ?? ''} onChange={(e) => set('failure_likelihood', num(e.target.value))} /></F>
          <F label="Reversibility, 0 to 2"><input type="number" min={0} max={2} value={f.reversibility ?? ''} onChange={(e) => set('reversibility', num(e.target.value))} /></F>
          <F label="Risk factor" hint="computed"><input value={f.risk_factor ?? ''} readOnly /></F>
        </div>
        <div className="four">
          <F label="Severity weight, 1 to 5"><input type="number" min={1} max={5} value={f.severity_weight ?? ''} onChange={(e) => set('severity_weight', num(e.target.value))} /></F>
          <F label="Reach, 0 to 1"><input type="number" step="0.01" min={0} max={1} value={f.reach ?? ''} onChange={(e) => set('reach', num(e.target.value))} /></F>
          <F label="Confidence factor, 0 to 1"><input type="number" step="0.05" min={0} max={1} value={f.confidence_factor ?? ''} onChange={(e) => set('confidence_factor', num(e.target.value))} /></F>
          <F label="Leverage, 1 to 5"><input type="number" min={1} max={5} value={f.leverage ?? ''} onChange={(e) => set('leverage', num(e.target.value))} /></F>
        </div>
      </G>

      <G n={7} name="Lifecycle" count={5} purpose="What happens after delivery. This is the part that keeps the register useful six months later.">
        <div className="two">
          <F label="Status">
            <select value={f.status} onChange={(e) => set('status', e.target.value as never)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </F>
          <F label="Verify by"><input type="date" value={f.verify_by ?? ''} onChange={(e) => set('verify_by', e.target.value || null)} /></F>
        </div>
        <F label="Verification method" required hint="The exact check that proves it is fixed. Written before the fix, not after.">
          <textarea value={f.verification_method ?? ''} onChange={(e) => set('verification_method', e.target.value)} />
        </F>
        <div className="two">
          <F label="Verified on"><input type="date" value={f.verified_on ?? ''} onChange={(e) => set('verified_on', e.target.value || null)} /></F>
          <F label="Closed note"><input value={f.closed_note ?? ''} onChange={(e) => set('closed_note', e.target.value)} /></F>
        </div>
      </G>

      <button className="btn danger" onClick={async () => {
        if (confirm(`Delete ${f.ref}?`)) { await deleteFinding(f.id); onDeleted() }
      }}>Delete finding</button>
    </div>
  )
}

function F({
  label, hint, children, lead, required,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  /** The claim the whole record hangs off. Set larger. */
  lead?: boolean
  /** The editor refuses to call the finding complete without these. */
  required?: boolean
}) {
  return (
    <div className={`fld${lead ? ' lead' : ''}${required ? ' required' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** One of the eight field groups. The number and purpose line are what make
 *  the eight read as a sequence rather than one long undifferentiated form. */
function G({
  n, name, purpose, count, children,
}: {
  n: number
  name: string
  purpose: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="grp">
      <header>
        <span className="num">{String(n).padStart(2, '0')}</span>
        <h4>{name}</h4>
        <span className="cnt">{count} fields</span>
      </header>
      <p className="purpose">{purpose}</p>
      {children}
    </section>
  )
}

function Measurements({ value, onChange }: { value: Measurement[]; onChange: (v: Measurement[]) => void }) {
  return (
    <div className="fld">
      <label>Measurements</label>
      {value.map((m, i) => (
        <div key={i} className="three" style={{ marginBottom: 6 }}>
          <input value={m.check} placeholder="what was checked"
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, check: e.target.value } : x)))} />
          <input value={m.result} placeholder="what came back"
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={m.taken}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, taken: e.target.value } : x)))} />
            <button className="btn sm danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>x</button>
          </div>
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...value, { check: '', result: '', taken: new Date().toISOString().slice(0, 10) }])}>
        Add measurement
      </button>
    </div>
  )
}

function Exhibits({ finding, onChange }: { finding: FindingFull; onChange: (f: FindingFull) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    finding.examples.forEach(async (e) => {
      if (e.image_path && !urls[e.id]) {
        const u = await evidenceUrl(e.image_path)
        if (u) setUrls((p) => ({ ...p, [e.id]: u }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding.examples])

  const patch = (id: string, p: Partial<Example>) => {
    onChange({ ...finding, examples: finding.examples.map((e) => (e.id === id ? { ...e, ...p } : e)) })
    updateExample(id, p)
  }

  return (
    <div className="fld">
      <label>Exhibits {finding.examples.length}</label>
      {finding.examples.map((e) => (
        <div className="rep" key={e.id}>
          <div className="rh">
            <span className="kind">{e.kind.replace('_', ' ')}</span>
            <span className="grow" />
            <button className="btn sm danger" onClick={async () => {
              await deleteExample(e.id)
              onChange({ ...finding, examples: finding.examples.filter((x) => x.id !== e.id) })
            }}>Remove</button>
          </div>

          {(e.kind === 'page_element' || e.kind === 'markup' || e.kind === 'response') && (
            <F label="URL"><input value={e.url ?? ''} onChange={(ev) => patch(e.id, { url: ev.target.value })} /></F>
          )}
          {e.kind === 'page_element' && (
            <div className="two">
              <F label="Selector" hint="What makes the image regenerable later.">
                <input value={e.selector ?? ''} onChange={(ev) => patch(e.id, { selector: ev.target.value })} />
              </F>
              <F label="Callout label"><input value={e.label ?? ''} onChange={(ev) => patch(e.id, { label: ev.target.value })} /></F>
            </div>
          )}
          {(e.kind === 'markup' || e.kind === 'response') && (
            <F label="Extract"><textarea className="mono" value={e.extract ?? ''} onChange={(ev) => patch(e.id, { extract: ev.target.value })} /></F>
          )}
          {e.kind === 'response' && (
            <F label="Request"><input className="mono" value={e.request ?? ''} onChange={(ev) => patch(e.id, { request: ev.target.value })} /></F>
          )}
          {e.kind === 'serp' && (
            <div className="two">
              <F label="Query"><input value={e.query ?? ''} onChange={(ev) => patch(e.id, { query: ev.target.value })} /></F>
              <F label="Surface"><input value={e.surface ?? ''} onChange={(ev) => patch(e.id, { surface: ev.target.value })} placeholder="google_web" /></F>
            </div>
          )}

          <F label="Caption"><textarea value={e.caption ?? ''} onChange={(ev) => patch(e.id, { caption: ev.target.value })} /></F>
          <div className="three">
            <F label="Captured"><input type="date" value={e.captured ?? ''} onChange={(ev) => patch(e.id, { captured: ev.target.value || null })} /></F>
            <F label="Redacted">
              <select value={e.redacted ? 'yes' : 'no'} onChange={(ev) => patch(e.id, { redacted: ev.target.value === 'yes' })}>
                <option value="no">no</option><option value="yes">yes</option>
              </select>
            </F>
            {(e.kind === 'page_element' || e.kind === 'serp') && (
              <F label="Image">
                <input type="file" accept="image/*" onChange={async (ev) => {
                  const file = ev.target.files?.[0]
                  if (!file) return
                  const path = await uploadEvidence(finding.org_id, file)
                  patch(e.id, { image_path: path })
                  const u = await evidenceUrl(path)
                  if (u) setUrls((p) => ({ ...p, [e.id]: u }))
                }} />
              </F>
            )}
          </div>
          {urls[e.id] && <img src={urls[e.id]} alt="" />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <button className="btn sm" key={k} onClick={async () => {
            const ex = await createExample(finding.org_id, finding.id, k, finding.examples.length)
            onChange({ ...finding, examples: [...finding.examples, ex] })
          }}>Add {k.replace('_', ' ')}</button>
        ))}
      </div>
    </div>
  )
}
