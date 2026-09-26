import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * A document you can leaf through.
 *
 * The pages are images, rendered from the real export at build time with the
 * fit pass already applied, so what you turn through is exactly what prints.
 *
 * They were live iframes first, which kept the type vector and selectable and
 * was lovely at rest. The turn was the problem: rotating an iframe in 3D makes
 * the compositor re-rasterise the whole page every frame, about 1600 by 2250
 * device pixels per face on a retina screen, and no amount of will-change or
 * layer promotion fixes that. Frame timings in a headless browser said sixty
 * a second; on real hardware it stuttered. A static image is one texture the
 * GPU already holds, so the turn costs nothing.
 *
 * Every page is mounted once and never moves in the tree, and the turn is two
 * faces rotating about a shared edge rather than a nested leaf, so each page
 * keeps a stable identity and only its role changes.
 */

const PAGE_W = 794   // 210mm at 96dpi
const PAGE_H = 1123  // 297mm
const TURN_MS = 620

type Role = 'left' | 'right' | 'away' | 'incoming' | 'hidden'

export default function Flipbook({ pages, label }: {
  pages: string[]; label: string
}) {
  const [spread, setSpread] = useState(0)
  const [turn, setTurn] = useState<{ dir: 'next' | 'prev'; from: number; armed: boolean } | null>(null)
  const [single, setSingle] = useState(false)
  const [scale, setScale] = useState(0.4)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  const per = single ? 1 : 2
  const last = Math.max(0, Math.ceil(pages.length / per) - 1)
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const narrow = w < 760
      setSingle(narrow)
      const byW = (w - 20) / (PAGE_W * (narrow ? 1 : 2))
      const byH = Math.min(window.innerHeight * 0.72, 880) / PAGE_H
      setScale(Math.max(0.16, Math.min(byW, byH)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { setSpread((s) => Math.min(s, last)) }, [last])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const go = useCallback((dir: 'next' | 'prev') => {
    setSpread((s) => {
      const to = dir === 'next' ? s + 1 : s - 1
      if (to < 0 || to > last) return s
      if (!reduced && !single) {
        // Two steps, a frame apart. The first puts the faces in their starting
        // positions and asks for a compositing layer; the second starts the
        // animation. Done in one go, layer creation lands on the animation's
        // first frame and costs 50ms of it, which is the whole budget for
        // three frames and reads as a stutter right at the start.
        setTurn({ dir, from: s, armed: false })
        requestAnimationFrame(() => requestAnimationFrame(() =>
          setTurn((t) => (t ? { ...t, armed: true } : t))))
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setTurn(null), TURN_MS + 40)
      }
      return to
    })
  }, [last, reduced, single])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); go('next') }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go('prev') }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go])

  /** Where each page sits right now. */
  const roles = useMemo(() => {
    const r = new Array<Role>(pages.length).fill('hidden')
    const put = (i: number, role: Role) => { if (i >= 0 && i < pages.length) r[i] = role }
    if (single) { put(spread, 'left'); return r }
    if (!turn) {
      put(spread * 2, 'left')
      put(spread * 2 + 1, 'right')
      return r
    }
    if (turn.dir === 'next') {
      // The leaf lifts off the right and swings across. Underneath it, the
      // page you were reading on the left stays put until it is covered, and
      // the next right hand page is already revealed behind.
      put(turn.from * 2, 'left')
      put(turn.from * 2 + 1, 'away')
      put(spread * 2, 'incoming')
      put(spread * 2 + 1, 'right')
    } else {
      put(turn.from * 2 + 1, 'right')
      put(turn.from * 2, 'away')
      put(spread * 2 + 1, 'incoming')
      put(spread * 2, 'left')
    }
    return r
  }, [pages.length, single, spread, turn])

  const w = PAGE_W * scale
  const h = PAGE_H * scale
  const shownFrom = single ? spread + 1 : spread * 2 + 1
  const shownTo = single ? spread + 1 : Math.min(spread * 2 + 2, pages.length)

  return (
    <figure className="fb" aria-label={label}>
      <div className="fb-stage" ref={box}>
        <div className={'fb-book' + (single ? ' one' : '')
          + (turn ? ` arm ${turn.dir}` + (turn.armed ? ' turning' : '') : '')}
          style={{ width: single ? w : w * 2, height: h }}>
          <div className="fb-gutter" style={{ width: single ? w : w * 2, height: h }} />
          {pages.map((html, i) => (
            <div key={i} className={'fb-page r-' + roles[i]}
              style={{ width: w, height: h, ['--pw' as string]: `${w}px` }}
              aria-hidden={roles[i] === 'hidden' || undefined}>
              <img
                className="fb-frame" src={html} alt={`Page ${i + 1}`} draggable={false}
                width={PAGE_W} height={PAGE_H} decoding="async"
                loading={Math.abs(i - spread * (single ? 1 : 2)) <= 3 ? 'eager' : 'lazy'}
                style={{ width: w, height: h }}
              />
            </div>
          ))}
        </div>
      </div>

      <figcaption className="fb-bar">
        <button className="fb-btn" onClick={() => go('prev')} disabled={spread === 0}
          aria-label="Previous page">‹</button>
        <span className="fb-count">
          {shownFrom === shownTo
            ? `Page ${shownFrom} of ${pages.length}`
            : `Pages ${shownFrom}–${shownTo} of ${pages.length}`}
        </span>
        <button className="fb-btn" onClick={() => go('next')} disabled={spread >= last}
          aria-label="Next page">›</button>
      </figcaption>
    </figure>
  )
}
