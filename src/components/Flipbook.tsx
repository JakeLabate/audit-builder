import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * A document you can leaf through.
 *
 * The pages are the real thing: the same HTML the exporter builds, each in its
 * own iframe so the report stylesheet cannot leak into the app and the app
 * cannot leak into the report. The text stays vector and selectable, which
 * images of pages would not be.
 *
 * Every page is mounted once and never moves in the tree. An earlier version
 * created the turning leaf's iframes at the moment the turn began, and they
 * had not painted before the animation finished, so the page turned blank. So
 * each page keeps a stable identity and only its role changes: left, right,
 * the face turning away, the face turning in, or out of sight.
 *
 * The turn is two independent faces rotating about the same edge rather than
 * one nested leaf. Visually identical, and it lets every page stay a sibling.
 */

const PAGE_W = 794   // 210mm at 96dpi
const PAGE_H = 1123  // 297mm
const TURN_MS = 620

type Role = 'left' | 'right' | 'away' | 'incoming' | 'hidden'

export default function Flipbook({ pages, css, label }: {
  pages: string[]; css: string; label: string
}) {
  const [spread, setSpread] = useState(0)
  const [turn, setTurn] = useState<{ dir: 'next' | 'prev'; from: number } | null>(null)
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
        setTurn({ dir, from: s })
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setTurn(null), TURN_MS)
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
        <div className={'fb-book' + (single ? ' one' : '') + (turn ? ' turning ' + turn.dir : '')}
          style={{ width: single ? w : w * 2, height: h }}>
          <div className="fb-gutter" style={{ width: single ? w : w * 2, height: h }} />
          {pages.map((html, i) => (
            <div key={i} className={'fb-page r-' + roles[i]}
              style={{ width: w, height: h, ['--pw' as string]: `${w}px` }}
              aria-hidden={roles[i] === 'hidden' || undefined}>
              <iframe
                className="fb-frame" srcDoc={frame(html, css)} scrolling="no"
                title={`Page ${i + 1}`} tabIndex={-1}
                style={{ width: PAGE_W, height: PAGE_H,
                  transform: `scale(${scale})`, transformOrigin: 'top left' }}
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

const frame = (html: string, css: string) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}
  html,body{margin:0;overflow:hidden;background:#fff}
  .page{page-break-after:auto}
</style></head><body>${html}</body></html>`
