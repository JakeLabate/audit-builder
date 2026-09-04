import type { Audit, Brand, FindingFull } from '../lib/types'
import { BAND_LABEL } from '../lib/score'

/**
 * PDF export. The browser's own print engine does the rendering, so there is
 * no service to run and no cost. The stylesheet uses @page and mm units,
 * matching the document system the audits are designed in.
 *
 * Layout follows the "split by reader" finding page: diagnosis on the left,
 * decision rail on the right, fix across the bottom.
 */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const SEV: Record<string, string> = { P1: 'crit', P2: 'high', P3: 'med', P4: 'med' }

function findingPage(f: FindingFull, brand: Brand, audit: Audit, page: number): string {
  const rows = f.measurements
    .map(
      (m) =>
        `<tr><td>${esc(m.check)}</td><td class="num">${esc(m.result)}</td><td class="dt">${esc(m.taken)}</td></tr>`,
    )
    .join('')
  const steps = f.steps.map((s) => `<li>${esc(s)}</li>`).join('')
  const exhibits = f.examples
    .map((e, i) => {
      const body =
        e.kind === 'markup' || e.kind === 'response'
          ? `<div class="code">${esc(e.extract)}</div>`
          : e.image_path
            ? `<div class="imgslot" data-path="${esc(e.image_path)}"></div>`
            : ''
      return `<div class="evfig">${body}<div class="evcap"><span class="n">${i + 1}</span>
        <span class="t">${esc(e.caption)}</span>
        <span class="m">${esc(e.captured ?? '')}</span></div></div>`
    })
    .join('')

  return `<div class="page"><div class="pg">
  <div class="hd"><span class="tag ${SEV[f.band ?? 'P4']}">${esc(f.band ?? 'Unscored')}</span>
    <span class="idl">${esc(f.ref)}</span></div>
  <h1 class="ttl">${esc(f.title)}</h1>
  <div class="split">
    <div>
      <div class="sect">What we found</div>
      <p class="body">${esc(f.impact_basis || f.action || '')}</p>
      ${rows ? `<div class="sect mt">The evidence</div><table class="ev">${rows}</table>` : ''}
      ${exhibits}
    </div>
    <div>
      <div class="score"><div class="n">${f.score ?? '--'}</div>
        <div class="l">${f.band ? `${f.band} / ${BAND_LABEL[f.band]}` : 'Not scored'}</div></div>
      <div class="rail">
        ${row('URLs affected', f.urls_affected)}
        ${row('Effort', f.effort_days != null ? `${f.effort_days} dev days` : null)}
        ${row('Owner', f.owner, true)}
        ${row('Verify by', f.verify_by, true)}
      </div>
    </div>
  </div>
  ${steps ? `<div class="fixbar"><div class="sect nb">The fix</div><ol class="steps">${steps}</ol></div>` : ''}
  <div class="foot"><span>Findings</span><span>${esc(brand.name)} / ${esc(audit.title)}</span><span>${page}</span></div>
</div></div>`
}

const row = (k: string, v: unknown, small = false) =>
  v == null || v === ''
    ? ''
    : `<div class="row"><div class="k">${esc(k)}</div><div class="v${small ? ' s' : ''}">${esc(v)}</div></div>`

export function buildPrintDocument(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
  byline: string,
): string {
  const ordered = [...findings].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 } as Record<string, number>
  for (const f of ordered) if (f.band) counts[f.band]++

  const cover = `<div class="page"><div class="pg cover">
    <div class="chip">Technical SEO Audit</div>
    <h1 class="cvtitle">${esc(audit.title)}</h1>
    <p class="cvsub">${esc(brand.name)}${brand.domain ? ` &nbsp;·&nbsp; ${esc(brand.domain)}` : ''}</p>
    <div class="cvstats">
      <div><b>${ordered.length}</b><span>Findings</span></div>
      <div><b>${counts.P1}</b><span>P1, do first</span></div>
      <div><b>${counts.P2}</b><span>P2, scheduled</span></div>
      <div><b>${audit.urls_crawled ?? '--'}</b><span>URLs crawled</span></div>
    </div>
    <div class="cvfoot"><span>${esc(byline)}</span><span>${esc(audit.delivered_on ?? new Date().toISOString().slice(0, 10))}</span></div>
  </div></div>`

  const index = `<div class="page"><div class="pg">
    <div class="sect">Document index</div>
    <h1 class="ttl">Findings, In Priority Order</h1>
    <table class="idx">${ordered
      .map(
        (f, i) =>
          `<tr><td class="n">${i + 1}</td><td>${esc(f.title)}</td><td class="b">${esc(f.band ?? '')}</td><td class="s">${f.score ?? ''}</td></tr>`,
      )
      .join('')}</table>
    <div class="foot"><span>Front matter</span><span>${esc(brand.name)} / ${esc(audit.title)}</span><span>2</span></div>
  </div></div>`

  const pages = ordered.map((f, i) => findingPage(f, brand, audit, i + 3)).join('')
  return `${cover}${index}${pages}`
}

/** Opens a print window containing only the document, then invokes print. */
export function printDocument(html: string, css: string, title: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) {
    alert('Your browser blocked the print window. Allow popups for this site and try again.')
    return
  }
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">` +
      `<style>${css}</style></head><body>${html}</body></html>`,
  )
  w.document.close()
  w.focus()
  // Give webfonts a moment, otherwise the first print uses fallbacks.
  const go = () => setTimeout(() => w.print(), 250)
  if (w.document.fonts) w.document.fonts.ready.then(go)
  else setTimeout(go, 600)
}
