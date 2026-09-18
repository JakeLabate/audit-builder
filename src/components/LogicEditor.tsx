import { useEffect, useMemo, useRef, useState } from 'react'
import type { Audit, Brand, Finding, FindingFull } from '../lib/types'
import { updateFinding } from '../lib/api'
import { BAND_LABEL, band as bandOf, riskFactor, score as scoreOf } from '../lib/score'
import {
  blockers, deriveConfidenceFactor, deriveLeverage, deriveReach, deriveRef, deriveVerifyBy,
  deriveWave, deriveWindow, EFFORT_BUCKETS, NEXT_STATUS, registryOf,
} from '../lib/derive'

/**
 * The logic-mode editor.
 *
 * Twenty four of the forty fields are not typed here. Four are generated, seven
 * are derived from other fields, eight are picked from a registry that lives
 * above the finding, two arrive from a tool, and three more are refused at save
 * rather than left to convention. Every non-manual field states how it got its
 * value, because a derived field nobody can interrogate is worse than a typed
 * one: at least a typed number has an author.
 */

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In progress', fixed: 'Fixed',
  verified: 'Verified', reopened: 'Reopened', accepted_risk: 'Accepted risk',
}

/* A field the consultant fills in. */
function M({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="lf">
      <label className="lf-l">{label}</label>
      {note && <p className="lf-n">{note}</p>}
      {children}
    </div>
  )
}

/* A field the system produced, with its reasoning on the record. */
function D({
  label, kind, value, how,
}: { label: string; kind: 'Generated' | 'Derived' | 'Computed' | 'Imported'; value: React.ReactNode; how: string }) {
  return (
    <div className={'lf lf-d k-' + kind.toLowerCase()}>
      <div className="lf-h">
        <label className="lf-l">{label}</label>
        <span className="lf-k">{kind}</span>
      </div>
      <div className="lf-v">{value === null || value === '' ? <em>not yet</em> : value}</div>
      <p className="lf-how">{how}</p>
    </div>
  )
}

function Group({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="lgrp">
      <h3>{name}</h3>
      <div className="lgrid">{children}</div>
    </section>
  )
}

export default function LogicEditor({
  finding, audit, brand, all, onSaved,
}: {
  finding: FindingFull
  audit: Audit
  brand: Brand | null
  all: FindingFull[]
  onSaved: (f: FindingFull) => void
}) {
  const [f, setF] = useState<FindingFull>(finding)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => { setF(finding); setErr(null) }, [finding.id])

  const reg = useMemo(() => registryOf(brand), [brand])
  const otherRefs = useMemo(
    () => all.filter((o) => o.id !== f.id).map((o) => o.ref),
    [all, f.id],
  )

  /* ---- everything the system works out, recomputed on every keystroke ---- */
  const ref = deriveRef(f.pillar, reg, otherRefs, f.ref)
  const win = deriveWindow(f)
  const reach = deriveReach(f, reg)
  const cfac = deriveConfidenceFactor(f)
  const lev = deriveLeverage(f, all)
  const vby = deriveVerifyBy(f, reg)

  const live: Finding = {
    ...f,
    ref: ref.value,
    collected_from: win.value.from,
    collected_to: win.value.to,
    reach: reach.value,
    confidence_factor: cfac.value,
    leverage: lev.value,
    verify_by: vby.value,
  }
  const rf = riskFactor(live)
  const sc = scoreOf(live)
  const bd = bandOf(sc)
  const wave = deriveWave({ ...live, wave: null }, bd, all)
  const stop = blockers(live)
  const frozen = audit.status !== 'draft'

  function set<K extends keyof Finding>(k: K, v: Finding[K]) {
    setF((p) => ({ ...p, [k]: v }))
  }

  /* Autosave writes the derived values too, so the row and the screen agree. */
  useEffect(() => {
    if (f.id !== finding.id) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      if (stop.length > 0) return
      setSaving(true)
      setErr(null)
      const patch: Partial<Finding> = {
        title: f.title, pillar: f.pillar, urls_affected: f.urls_affected,
        templates: f.templates, markets: f.markets, source: f.source,
        measurements: f.measurements, confidence: f.confidence,
        confidence_reason: f.confidence_reason, impact_type: f.impact_type,
        metric_at_risk: f.metric_at_risk, quantity_value: f.quantity_value,
        quantity_unit: f.quantity_unit, impact_basis: f.impact_basis,
        time_horizon: f.time_horizon, affects: f.affects, action: f.action,
        steps: f.steps, owner: f.owner, effort_days: f.effort_days,
        depends_on: f.depends_on, external_blockers: f.external_blockers,
        blast_radius: f.blast_radius, failure_likelihood: f.failure_likelihood,
        reversibility: f.reversibility, severity_weight: f.severity_weight,
        status: f.status, verification_method: f.verification_method,
        verified_on: f.verified_on, closed_note: f.closed_note,
        // the generated and derived ones
        ref: ref.value, collected_from: win.value.from, collected_to: win.value.to,
        reach: reach.value, confidence_factor: cfac.value, leverage: lev.value,
        wave: wave.value, verify_by: vby.value,
      }
      if (frozen) delete patch.ref
      try {
        await updateFinding(f.id, patch)
        onSaved({ ...f, ...patch, score: sc, band: bd, risk_factor: rf } as FindingFull)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setSaving(false)
      }
    }, 700)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f])

  const list = (v: string[]) => v.join(', ')
  const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="logic">

      <div className="lbar">
        <span className="lbar-s">{sc ?? '--'}</span>
        <span className={'lbar-b b-' + (bd ?? 'none').toLowerCase()}>
          {bd ? `${bd} · ${BAND_LABEL[bd]}` : 'Not scored'}
        </span>
        <span className="grow" />
        <span className="saving">{saving ? 'Saving' : err ? '' : 'Saved'}</span>
      </div>

      {err && <div className="lstop"><b>The database refused this</b>{err}</div>}
      {stop.length > 0 && (
        <div className="lstop">
          <b>Not saving until these are settled</b>
          <ul>{stop.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}

      <Group name="Identity">
        <D label="Reference" kind="Generated"
           value={<code>{ref.value}</code>}
           how={frozen
             ? `${ref.how} The audit is ${audit.status.replace('_', ' ')}, so this is now a citation in a delivered document and cannot change.`
             : ref.how} />
        <M label="Pillar" note="Picked from this brand's registry. It issues the reference prefix.">
          <select value={f.pillar ?? ''} onChange={(e) => set('pillar', e.target.value || null)}>
            <option value="">Not set</option>
            {reg.pillars.map((p) => <option key={p.code} value={p.name}>{p.name} · {p.code}</option>)}
          </select>
        </M>
        <M label="Title, stated as a claim">
          <textarea rows={2} value={f.title} onChange={(e) => set('title', e.target.value)} />
        </M>
        <D label="Raised" kind="Generated" value={f.raised}
           how="Stamped when the finding was created. It starts the clock, so it is not editable." />
      </Group>

      <Group name="Scope">
        <D label="URLs affected" kind="Imported" value={f.urls_affected ?? ''}
           how="Comes off the crawl. Typing it by hand is how the number drifts from the evidence." />
        <M label="Templates" note="From the registry. Each one carries a universe, which is what makes reach arithmetic.">
          <div className="lchips">
            {reg.templates.map((t) => (
              <label key={t.name} className={'lchip' + (f.templates.includes(t.name) ? ' on' : '')}>
                <input type="checkbox" checked={f.templates.includes(t.name)}
                  onChange={(e) => set('templates', e.target.checked
                    ? [...f.templates, t.name]
                    : f.templates.filter((x) => x !== t.name))} />
                {t.name} <span>{t.universe.toLocaleString('en-US')}</span>
              </label>
            ))}
          </div>
        </M>
        <M label="Markets" note="Constrained to the markets this brand actually operates.">
          <div className="lchips">
            {reg.markets.map((m) => (
              <label key={m} className={'lchip' + (f.markets.includes(m) ? ' on' : '')}>
                <input type="checkbox" checked={f.markets.includes(m)}
                  onChange={(e) => set('markets', e.target.checked
                    ? [...f.markets, m]
                    : f.markets.filter((x) => x !== m))} />
                {m}
              </label>
            ))}
          </div>
        </M>
      </Group>

      <Group name="Evidence">
        <D label="Collected from" kind="Derived" value={win.value.from ?? ''} how={win.how} />
        <D label="Collected to" kind="Derived" value={win.value.to ?? ''} how={win.how} />
        <M label="Sources" note="Comma separated. Must be tools the audit declared, or the save is refused.">
          <input value={list(f.source)} onChange={(e) => set('source', toList(e.target.value))} />
        </M>
        <M label="Confidence">
          <select value={f.confidence ?? ''} onChange={(e) => set('confidence', (e.target.value || null) as never)}>
            <option value="">Not set</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </M>
        {f.confidence && f.confidence !== 'high' && (
          <M label="Reason it is not high" note="Required whenever confidence is below high.">
            <textarea rows={2} value={f.confidence_reason ?? ''}
              onChange={(e) => set('confidence_reason', e.target.value)} />
          </M>
        )}
      </Group>

      <Group name="Impact">
        <M label="Impact type">
          <select value={f.impact_type ?? ''} onChange={(e) => set('impact_type', (e.target.value || null) as never)}>
            <option value="">Not set</option>
            <option value="duplicate_content">Duplicate content</option>
            <option value="crawl_waste">Crawl waste</option>
            <option value="lost_visibility">Lost visibility</option>
            <option value="broken_experience">Broken experience</option>
            <option value="compliance_exposure">Compliance exposure</option>
          </select>
        </M>
        <M label="Metric at risk" note="From the registry, so exposure can be totalled across the audit.">
          <select value={f.metric_at_risk ?? ''} onChange={(e) => set('metric_at_risk', e.target.value || null)}>
            <option value="">Not set</option>
            {reg.metrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </M>
        <M label="Quantity">
          <input type="number" step="any" value={f.quantity_value ?? ''}
            onChange={(e) => set('quantity_value', e.target.value === '' ? null : Number(e.target.value))} />
        </M>
        <M label="Unit">
          <select value={f.quantity_unit ?? ''} onChange={(e) => set('quantity_unit', e.target.value || null)}>
            <option value="">Not set</option>
            {reg.units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </M>
        {f.quantity_value != null && (
          <M label="Impact basis" note="Required because you asserted a quantity.">
            <textarea rows={2} value={f.impact_basis ?? ''} onChange={(e) => set('impact_basis', e.target.value)} />
          </M>
        )}
      </Group>

      <Group name="Remedy">
        <M label="Action"><textarea rows={2} value={f.action ?? ''} onChange={(e) => set('action', e.target.value)} /></M>
        <M label="Owner" note="A team from the registry, never a person.">
          <select value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value || null)}>
            <option value="">Not set</option>
            {reg.owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </M>
        <M label="Effort" note="Bucketed. Continuous days invite false precision on the field that dominates the score.">
          <select value={f.effort_days ?? ''}
            onChange={(e) => set('effort_days', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Not set</option>
            {EFFORT_BUCKETS.map((b) => <option key={b} value={b}>{b} {b === 1 ? 'day' : 'days'}</option>)}
          </select>
        </M>
        <M label="Blocked by" note="Other findings in this audit. This is the graph that wave order and leverage are read from.">
          <div className="lchips">
            {all.filter((o) => o.id !== f.id).map((o) => (
              <label key={o.id} className={'lchip' + ((f.depends_on ?? []).includes(o.id) ? ' on' : '')}>
                <input type="checkbox" checked={(f.depends_on ?? []).includes(o.id)}
                  onChange={(e) => set('depends_on', e.target.checked
                    ? [...(f.depends_on ?? []), o.id]
                    : (f.depends_on ?? []).filter((x) => x !== o.id))} />
                {o.ref}
              </label>
            ))}
          </div>
        </M>
        <M label="External blockers" note="Things that are not findings: a deploy window, a sign off. Comma separated.">
          <input value={list(f.external_blockers ?? [])}
            onChange={(e) => set('external_blockers', toList(e.target.value))} />
        </M>
        <D label="Wave" kind="Derived" value={wave.value ?? ''} how={wave.how} />
      </Group>

      <Group name="Risk and priority">
        <M label="Blast radius">
          <select value={f.blast_radius ?? ''} onChange={(e) => set('blast_radius', Number(e.target.value) || null)}>
            <option value="">Not set</option>
            <option value="1">1 · one page</option>
            <option value="2">2 · one template</option>
            <option value="3">3 · the whole site</option>
          </select>
        </M>
        <M label="Failure likelihood">
          <select value={f.failure_likelihood ?? ''} onChange={(e) => set('failure_likelihood', Number(e.target.value) || null)}>
            <option value="">Not set</option>
            <option value="1">1 · a config change</option>
            <option value="2">2 · some moving parts</option>
            <option value="3">3 · a rewrite</option>
          </select>
        </M>
        <M label="Reversibility">
          <select value={f.reversibility ?? ''}
            onChange={(e) => set('reversibility', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Not set</option>
            <option value="2">2 · a toggle you flip back</option>
            <option value="1">1 · needs a deploy</option>
            <option value="0">0 · permanent</option>
          </select>
        </M>
        <D label="Risk factor" kind="Computed" value={rf.toFixed(2)}
           how={`1.3 minus (blast ${f.blast_radius ?? 2} plus likelihood ${f.failure_likelihood ?? 2}) over 20, minus reversibility ${f.reversibility ?? 1} over 20, clamped between 0.6 and 1.2.`} />
        <M label="Severity" note="The one priority input that stays a human call.">
          <select value={f.severity_weight ?? ''} onChange={(e) => set('severity_weight', Number(e.target.value) || null)}>
            <option value="">Not set</option>
            <option value="1">1 · nothing anyone could measure</option>
            <option value="2">2 · long tail nobody would notice</option>
            <option value="3">3 · a category stops performing</option>
            <option value="4">4 · a revenue line moves</option>
            <option value="5">5 · someone outside marketing notices</option>
          </select>
        </M>
        <D label="Reach" kind="Derived" value={reach.value ?? ''} how={reach.how} />
        <D label="Confidence factor" kind="Derived" value={cfac.value?.toFixed(1) ?? ''} how={cfac.how} />
        <D label="Leverage" kind="Derived" value={lev.value} how={lev.how} />
        <D label="Score" kind="Computed" value={sc ?? ''}
           how={sc == null
             ? 'Needs severity and effort.'
             : `3 times (${f.severity_weight} severity times ${reach.value ?? 1} reach times ${cfac.value ?? 1} confidence times ${lev.value} leverage) over the square root of ${f.effort_days} effort days, times ${rf.toFixed(2)} risk factor, capped at 100.`} />
      </Group>

      <Group name="Lifecycle">
        <M label="Status" note="Only the moves that are legal from here.">
          <div className="lmoves">
            <span className="lnow">{STATUS_LABEL[f.status]}</span>
            {(NEXT_STATUS[f.status] ?? []).map((s) => (
              <button key={s} type="button" className="btn sm" onClick={() => set('status', s as never)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </M>
        <M label="Verification method" note="Written before the fix, so it is an honest test rather than one chosen to pass.">
          <textarea rows={3} value={f.verification_method ?? ''}
            onChange={(e) => set('verification_method', e.target.value)} />
        </M>
        <D label="Verify by" kind="Derived" value={vby.value ?? ''} how={vby.how} />
        {f.status === 'verified' && (
          <M label="Verified on" note="Only settable while the status is verified, and it cannot be cleared without moving off it.">
            <input type="date" value={f.verified_on ?? ''}
              onChange={(e) => set('verified_on', e.target.value || null)} />
          </M>
        )}
        {['fixed', 'verified', 'accepted_risk'].includes(f.status) && (
          <M label="Closing note" note={`Required because the status is ${f.status.replace('_', ' ')}.`}>
            <textarea rows={2} value={f.closed_note ?? ''} onChange={(e) => set('closed_note', e.target.value)} />
          </M>
        )}
      </Group>

    </div>
  )
}
