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

/**
 * Scored fields are stored as numbers because the formula needs numbers, but a
 * bare "2" in a box tells a new user nothing. Each scale is presented as its
 * meaning; the number rides along so the value stays legible and auditable.
 */
type Scale = [value: number, label: string][]

const BLAST: Scale = [
  [1, '1 · A single page or a non-production host'],
  [2, '2 · One template or one section of the site'],
  [3, '3 · The whole site'],
]
const LIKELIHOOD: Scale = [
  [1, '1 · A config change, hard to get wrong'],
  [2, '2 · A template edit carrying real logic'],
  [3, '3 · A rewrite or a migration'],
]
const REVERSIBILITY: Scale = [
  [2, '2 · A toggle you can flip straight back'],
  [1, '1 · Undoable, but it takes work'],
  [0, '0 · Permanent once it ships'],
]
const SEVERITY: Scale = [
  [5, '5 · Critical, costing traffic or trust now'],
  [4, '4 · High, clear harm that will not self-correct'],
  [3, '3 · Medium, real but bounded'],
  [2, '2 · Low, mostly hygiene'],
  [1, '1 · Cosmetic'],
]
const REACH: Scale = [
  [1, '1.0 · Every relevant page'],
  [0.75, '0.75 · Most of them'],
  [0.5, '0.5 · About half'],
  [0.25, '0.25 · A minority'],
  [0.1, '0.1 · A handful'],
]
const CONF_FACTOR: Scale = [
  [1, '1.0 · Certain, several signals agree'],
  [0.75, '0.75 · Likely, one solid signal'],
  [0.5, '0.5 · Plausible, evidence is indirect'],
  [0.25, '0.25 · Suspected, needs verifying'],
]
const LEVERAGE: Scale = [
  [5, '5 · Unblocks a lot of later work'],
  [4, '4 · Unblocks several other fixes'],
  [3, '3 · Unblocks one or two'],
  [2, '2 · Minor knock-on benefit'],
  [1, '1 · Stands alone'],
]

/** A scale rendered as its meanings. Keeps any pre-existing off-scale value. */
function ScaleSelect({
  value, scale, onChange,
}: {
  value: number | null
  scale: Scale
  onChange: (v: number | null) => void
}) {
  const known = scale.some(([v]) => v === value)
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">Not set</option>
      {!known && value != null && <option value={value}>{value} (set manually)</option>}
      {scale.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  )
}

/** Enum options written as sentences rather than database values. */
const IMPACT_LABEL: Record<string, string> = {
  duplicate_content: 'Duplicate content · indexed more than once',
  crawl_waste: 'Crawl waste · effort spent on pages that cannot earn it',
  lost_visibility: 'Lost visibility · should rank or be cited, and is not',
  broken_experience: 'Broken experience · users hit something that fails',
  compliance_exposure: 'Compliance exposure · a legal or policy risk',
}
const HORIZON_LABEL: Record<string, string> = {
  already_happening: 'Already happening · costing something today',
  next_crawl_cycle: 'Next crawl cycle · days to weeks',
  next_release: 'Next release · bites when the next change ships',
  latent: 'Latent · harmless until something else changes',
}
const PARTY_LABEL: Record<string, string> = {
  end_users: 'End users',
  crawlers: 'Search engines and crawlers',
  internal_team: 'The internal team',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Open · nobody has started',
  in_progress: 'In progress · work has begun',
  fixed: 'Fixed · shipped, not yet checked',
  verified: 'Verified · checked and confirmed',
  reopened: 'Reopened · it came back',
  accepted_risk: 'Accepted risk · a deliberate decision not to fix',
}
const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High · several independent signals agree',
  medium: 'Medium · one signal, or it varies run to run',
  low: 'Low · indirect, flag it as provisional',
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
        <div className="big">
          <div className="n">{f.score ?? '--'}</div>
          <div className="l">{f.band ? `${f.band} / ${BAND_LABEL[f.band]}` : 'Not scored'}</div>
        </div>
        <div className="terms">
          {[
            ['Severity', f.severity_weight, 'how bad on its own terms, 1 to 5'],
            ['Reach', f.reach, 'share of relevant surface affected, 0 to 1'],
            ['Confidence', f.confidence_factor, 'discount when the evidence is thinner, 0 to 1'],
            ['Leverage', f.leverage, 'how much other work this unblocks, 1 to 5'],
            ['Effort', f.effort_days == null ? null : `${f.effort_days}d`, 'engineering days'],
            ['Risk', f.risk_factor, 'computed from blast radius, likelihood and reversibility'],
          ].map(([label, value, tip]) => (
            <div key={String(label)} title={String(tip)}>
              <span className="k">{label}</span>
              <span className="v">{value ?? 'not set'}</span>
            </div>
          ))}
        </div>
      </div>

      {issues.map((m, i) => (
        <div className="issue" key={i}><b>Incomplete</b>{m}</div>
      ))}

      <G name="Identity" purpose="What this finding is. The reference never changes once issued, and the title is stated as a claim rather than a topic.">
        <div className="two">
          <F label="Reference"><input value={f.ref} onChange={(e) => set('ref', e.target.value)} /></F>
          <F label="Pillar"><input value={f.pillar ?? ''} onChange={(e) => set('pillar', e.target.value)} /></F>
        </div>
        <F label="Title, stated as a claim" lead>
          <input value={f.title} onChange={(e) => set('title', e.target.value)}
                 placeholder="The staging subdomain is fully indexed" />
        </F>
      </G>

      <G name="Scope" purpose="How much of the site it touches. A template-level issue is one fix; a page-level issue is many.">
        <div className="three">
          <F label="URLs affected">
            <input type="number" value={f.urls_affected ?? ''} onChange={(e) => set('urls_affected', num(e.target.value))} />
          </F>
          <F label="Templates">
            <input value={f.templates.join(', ')} onChange={(e) => set('templates', list(e.target.value))} />
          </F>
          <F label="Markets">
            <input value={f.markets.join(', ')} onChange={(e) => set('markets', list(e.target.value))} />
          </F>
        </div>
      </G>

      <G name="Evidence" purpose="How we know. Measurements are the numbers that support the claim; exhibits are what shows it.">
        <Measurements value={f.measurements} onChange={(v) => set('measurements', v)} />
        <div className="three">
          <F label="Sources">
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
              <option value="">Not set</option>
              {(['high', 'medium', 'low'] as const).map((v) => (
                <option key={v} value={v}>{CONFIDENCE_LABEL[v]}</option>
              ))}
            </select>
          </F>
          <F label="Reason, if below high">
            <input value={f.confidence_reason ?? ''} onChange={(e) => set('confidence_reason', e.target.value)} />
          </F>
        </div>
        <Exhibits finding={f} onChange={onChange} />
      </G>

      <G name="Impact" purpose="What it costs. Any quantity asserted here has to state where it came from.">
        <div className="two">
          <F label="Impact type">
            <select value={f.impact_type ?? ''} onChange={(e) => set('impact_type', (e.target.value || null) as never)}>
              <option value="">Not set</option>
              {IMPACT_TYPES.map((t) => <option key={t} value={t}>{IMPACT_LABEL[t]}</option>)}
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
        <F label="Impact basis" required hint="Where the quantity above came from, in one sentence. Nothing is published with a number that cannot say this.">
          <textarea value={f.impact_basis ?? ''} onChange={(e) => set('impact_basis', e.target.value)} />
        </F>
        <div className="two">
          <F label="Time horizon">
            <select value={f.time_horizon ?? ''} onChange={(e) => set('time_horizon', (e.target.value || null) as never)}>
              <option value="">Not set</option>
              {HORIZONS.map((h) => <option key={h} value={h}>{HORIZON_LABEL[h]}</option>)}
            </select>
          </F>
          <F label="Affects">
            <div className="chiprow">
              {PARTIES.map((p) => (
                <button key={p} type="button"
                  className={`btn sm${f.affects.includes(p) ? ' pri' : ''}`}
                  onClick={() => set('affects', f.affects.includes(p) ? f.affects.filter((x) => x !== p) : [...f.affects, p])}>
                  {PARTY_LABEL[p]}
                </button>
              ))}
            </div>
          </F>
        </div>
      </G>

      <G name="Remedy" purpose="What to do about it, written so a competent engineer can act without asking a follow-up question.">
        <F label="Action"><input value={f.action ?? ''} onChange={(e) => set('action', e.target.value)} /></F>
        <F label="Steps">
          <textarea value={f.steps.join('\n')} onChange={(e) => set('steps', e.target.value.split('\n').filter((s) => s.trim()))} />
        </F>
        <div className="four">
          <F label="Owner"><input value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} /></F>
          <F label="Effort, days"><input type="number" step="0.5" value={f.effort_days ?? ''} onChange={(e) => set('effort_days', num(e.target.value))} /></F>
          <F label="Wave"><input type="number" value={f.wave ?? ''} onChange={(e) => set('wave', num(e.target.value))} /></F>
          <F label="Depends on">
            <input value={f.dependencies.join(', ')} onChange={(e) => set('dependencies', list(e.target.value))} />
          </F>
        </div>
      </G>

      <G name="Risk and priority" purpose="What could go wrong fixing it, and the inputs the score is computed from. None of these are typed opinions about the score itself.">
        <div className="four">
          <F label="Blast radius"><ScaleSelect value={f.blast_radius} scale={BLAST} onChange={(v) => set('blast_radius', v)} /></F>
          <F label="Failure likelihood"><ScaleSelect value={f.failure_likelihood} scale={LIKELIHOOD} onChange={(v) => set('failure_likelihood', v)} /></F>
          <F label="Reversibility"><ScaleSelect value={f.reversibility} scale={REVERSIBILITY} onChange={(v) => set('reversibility', v)} /></F>
          <F label="Risk factor"><input value={f.risk_factor ?? ''} readOnly /></F>
        </div>
        <div className="four">
          <F label="Severity"><ScaleSelect value={f.severity_weight} scale={SEVERITY} onChange={(v) => set('severity_weight', v)} /></F>
          <F label="Reach"><ScaleSelect value={f.reach} scale={REACH} onChange={(v) => set('reach', v)} /></F>
          <F label="Confidence factor"><ScaleSelect value={f.confidence_factor} scale={CONF_FACTOR} onChange={(v) => set('confidence_factor', v)} /></F>
          <F label="Leverage"><ScaleSelect value={f.leverage} scale={LEVERAGE} onChange={(v) => set('leverage', v)} /></F>
        </div>
      </G>

      <G name="Lifecycle" purpose="What happens after delivery. This is the part that keeps the register useful six months later.">
        <div className="two">
          <F label="Status">
            <select value={f.status} onChange={(e) => set('status', e.target.value as never)}>
              {STATUSES.map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
            </select>
          </F>
          <F label="Verify by"><input type="date" value={f.verify_by ?? ''} onChange={(e) => set('verify_by', e.target.value || null)} /></F>
        </div>
        <F label="Verification method" required hint="The exact check that will prove this is fixed. Write it now, before the fix, so it is an honest test rather than one chosen to pass.">
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

/**
 * One line of plain help for every field, written for someone who has never
 * built an audit in this shape before. Kept in one map rather than scattered
 * through the markup so the wording can be reviewed as a whole.
 */
const HINT: Record<string, string> = {
  // identity
  'Reference': "This finding's permanent ID, like TECH-014. Never reuse or renumber it once it has gone to a client.",
  'Pillar': 'Which area of the audit this came from, for example Indexation control or Answer eligibility.',
  'Title, stated as a claim': 'Say what is wrong, not what the topic is. "The staging subdomain is fully indexed", not "Staging".',
  // scope
  'URLs affected': 'How many URLs actually have this problem.',
  'Templates': 'Which page templates are affected. A template-level problem is one fix; a page-level one is many.',
  'Markets': 'Which locales or country sites are affected. Leave blank if the site is single-market.',
  // evidence
  'Measurements': 'Each check you ran, what it returned, and the date. These rows are the proof behind the claim.',
  'Sources': 'The tools or datasets you used, by name. Screaming Frog, Search Console, server logs.',
  'Collected from': 'First date your data covers.',
  'Collected to': 'Last date your data covers. Without a window, nobody can re-verify this later.',
  'Confidence': 'How strongly the evidence supports the claim.',
  'Reason, if below high': 'Why it is not high. Fill this in whenever confidence is medium or low.',
  'Exhibits': 'Screenshots, markup or responses that show the problem in place, so the reader does not have to go looking for it.',
  // impact
  'Impact type': 'What kind of harm this causes.',
  'Metric at risk': 'Which measure moves if this is not fixed. Sessions, clicks, revenue, or none if you cannot honestly name one.',
  'Quantity': 'The size of the exposure, as a number.',
  'Unit': 'What that number counts, for example sessions_per_month.',
  'Time horizon': 'When this starts costing something.',
  'Affects': 'Who actually feels it.',
  // remedy
  'Action': 'The fix in one line, written as an instruction to the owner.',
  'Steps': 'The fix broken down so an engineer can follow it without asking a follow-up question. One step per line.',
  'Owner': 'The team that can actually make this change. Name a team, not a person.',
  'Effort, days': 'Engineering days. This feeds the priority score, so a rough estimate beats leaving it blank.',
  'Wave': 'Which phase of the roadmap this lands in. Wave 1 is the first block of work.',
  'Depends on': 'Findings that have to be fixed before this one. Use their references, like TECH-014.',
  // risk
  'Blast radius': 'How much breaks if the fix goes wrong. 1 is a single page, 3 is the whole site.',
  'Failure likelihood': 'How likely the fix is to break something. 1 is a config change, 3 is a rewrite.',
  'Reversibility': 'How easily it can be undone. 2 is a toggle you can flip back, 0 is permanent.',
  'Risk factor': 'Calculated from the three fields above. You cannot edit this directly.',
  // priority
  'Severity': 'How bad the problem is on its own, before considering how many pages it hits.',
  'Reach': 'What share of the relevant pages this affects. 1 means all of them.',
  'Confidence factor': 'Lowers the score when your evidence is thinner. 1 means you are certain.',
  'Leverage': 'How much other work this unblocks. High leverage means fixing it makes later fixes possible.',
  // lifecycle
  'Status': 'Where this stands right now.',
  'Verify by': 'When to run the check. Usually one crawl cycle after the fix ships.',
  'Verified on': 'When you actually confirmed it was fixed. Leave blank until then.',
  'Closed note': "What changed, in the client's own words, so the record still makes sense after staff turnover.",
  // exhibit fields
  'URL': 'The page this exhibit came from.',
  'Selector': 'CSS selector for the element to highlight. This is what lets the screenshot be regenerated later.',
  'Callout label': 'Short text drawn onto the image itself. Keep it under about 45 characters.',
  'Extract': 'Paste the source or response exactly as it appeared. Do not tidy it up.',
  'Request': 'The exact command that produced this, so anyone can repeat it.',
  'Query': 'The search or prompt that produced this result.',
  'Surface': 'Which engine or assistant answered, for example google_web.',
  'Caption': 'What this exhibit proves, in your words. This is the only judged field on an exhibit.',
  'Captured': 'When you took it. This date is printed on the figure.',
  'Redacted': 'Whether you masked anything before including it. Say yes if you blurred client data.',
  'Image': 'PNG or JPEG, up to 10MB.',
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
  // An explicit hint wins; otherwise fall back to the shared map.
  const help = hint ?? HINT[label]
  return (
    <div className={`fld${lead ? ' lead' : ''}${required ? ' required' : ''}`}>
      <label>{label}</label>
      {help && <p className="hint">{help}</p>}
      {children}
    </div>
  )
}

/** One field group. The heading and the purpose line carry the level; a
 *  number and a field count were decoration and said nothing useful. */
function G({
  name, purpose, children,
}: {
  name: string
  purpose: string
  children: React.ReactNode
}) {
  return (
    <section className="grp">
      <h4>{name}</h4>
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
              <F label="Selector">
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
                <option value="no">No, nothing was masked</option>
                <option value="yes">Yes, something was masked before including it</option>
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
