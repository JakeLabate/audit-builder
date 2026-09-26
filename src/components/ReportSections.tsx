import { useEffect, useRef, useState } from 'react'
import type { Audit } from '../lib/types'
import { updateAudit } from '../lib/api'
import { CATALOGUE, pageCount, sectionsOf, type SectionChoice } from '../lib/sections'

/**
 * What the deliverable contains, and in what order.
 *
 * Stored on the audit rather than chosen at export, so two exports of the
 * same audit cannot quietly disagree about what the client was sent.
 *
 * Reordering is buttons rather than drag: it is keyboard reachable, it works
 * on a phone, and nobody has ever accidentally dropped a section on the floor
 * with an arrow key.
 */
export default function ReportSections({
  audit, findingCount, onChange,
}: {
  audit: Audit
  findingCount: number
  onChange: (a: Audit) => void
}) {
  const [list, setList] = useState<SectionChoice[]>(() => sectionsOf(audit))
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => { setList(sectionsOf(audit)) }, [audit.id])

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await updateAudit(audit.id, { sections: list } as Partial<Audit>)
        onChange({ ...audit, sections: list })
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 600)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  const meta = (k: string) => CATALOGUE.find((c) => c.key === k)!

  function toggle(i: number) {
    setList((p) => p.map((s, j) => (j === i ? { ...s, on: !s.on } : s)))
  }

  function move(i: number, by: -1 | 1) {
    setList((p) => {
      const j = i + by
      // The cover is the first page or it is not a cover.
      if (j < 0 || j >= p.length) return p
      if (p[i].key === 'cover' || p[j].key === 'cover') return p
      const next = [...p]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const total = pageCount(list, findingCount)

  return (
    <section className="rs">
      <header className="rs-hd">
        <div>
          <h3>What the report contains</h3>
          <p>Saved on this audit, so every export of it has the same shape.</p>
        </div>
        <span className="rs-count">
          <b>{total}</b> {total === 1 ? 'page' : 'pages'}
        </span>
      </header>

      <ol className="rs-list">
        {list.map((s, i) => {
          const c = meta(s.key)
          const blocked = c.needs?.(audit) ?? null
          const pages = c.pages === 'per-finding' ? findingCount : c.pages
          return (
            <li key={s.key} className={'rs-row' + (s.on ? '' : ' off')}>
              <div className="rs-move">
                <button className="rs-arrow" onClick={() => move(i, -1)}
                  disabled={i === 0 || s.key === 'cover' || list[i - 1]?.key === 'cover'}
                  aria-label={`Move ${c.name} earlier`}>↑</button>
                <button className="rs-arrow" onClick={() => move(i, 1)}
                  disabled={i === list.length - 1 || s.key === 'cover'}
                  aria-label={`Move ${c.name} later`}>↓</button>
              </div>

              <label className="rs-tick">
                <input type="checkbox" checked={s.on} onChange={() => toggle(i)} />
                <span className="rs-box" />
              </label>

              <div className="rs-body">
                <div className="rs-name">
                  {c.name}
                  <span className="rs-pages">
                    {pages} {pages === 1 ? 'page' : 'pages'}
                    {c.pages === 'per-finding' ? ', one per finding' : ''}
                  </span>
                </div>
                <p className="rs-what">{c.what}</p>
                {s.on && blocked && <p className="rs-warn">{blocked}</p>}
              </div>
            </li>
          )
        })}
      </ol>

      {!list.some((s) => s.key === 'findings' && s.on) && (
        <div className="rs-note">
          The findings are switched off, so this export is a summary document with no
          detail behind it. That is a real choice for a board readout, and the wrong one
          for a handover to the team doing the work.
        </div>
      )}

      {err && <div className="issue" style={{ marginTop: 12 }}><b>Could not save</b>{err}</div>}
    </section>
  )
}
