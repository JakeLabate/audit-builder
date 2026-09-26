import type { Audit, Brand, FindingFull } from '../lib/types'
import { BAND_LABEL } from '../lib/score'
import { fontHref, identityOf, reportPalette } from '../lib/brand'
import { sectionsOf, type SectionKey } from '../lib/sections'
import { clientFindings, depthOf, type DepthSpec } from '../lib/depth'
import { kindOf } from '../lib/kind'

/**
 * PDF export. The browser's own print engine does the rendering, so there is
 * no service to run and no cost. The stylesheet uses @page and mm units,
 * matching the document system the audits are designed in.
 *
 * Layout follows the "split by reader" finding page: diagnosis on the left,
 * decision rail on the right, fix across the bottom.
 */

/** Long extracts are the main reason a finding will not fit. Show the head of
 *  it and say how much was left out, rather than letting it push the fix off
 *  the page or silently clipping at the page edge. */
function clampExtract(text: string, max: number): string {
  const lines = String(text ?? '').split('\n')
  if (lines.length <= max) return esc(text)
  const rest = lines.length - max
  return esc(lines.slice(0, max).join('\n')) +
    `\n<span class="clip">${rest} more ${rest === 1 ? 'line' : 'lines'} not shown</span>`
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const SEV: Record<string, string> = { P1: 'crit', P2: 'high', P3: 'med', P4: 'med' }

/**
 * A finding page is one page. Always.
 *
 * The fit pass below scales a page down until it fits, but it stops at a floor
 * rather than printing something nobody can read, and a finding carrying nine
 * measurements and three long exhibits is genuinely two pages of material. So
 * the elastic parts are budgeted here, sized so the worst case still fits at
 * the floor, and what is left out says so. The full record is in the register
 * and the API; the page is the client's summary of it.
 */
/**
 * A finding page is one page. Always.
 *
 * A static budget can always be beaten by a finding carrying more than the
 * budget allowed, so the page does not guess. Everything optional is marked
 * droppable with a priority, and the fit pass below removes the heaviest
 * material until the page genuinely fits, scaling only for what is left.
 * What came out is counted and said, so nothing disappears silently. The full
 * record is in the register and the API; the page is the client's summary.
 *
 * Drop order, heaviest first: extra exhibits, then extra measurements, then
 * extra steps. The first of each always survives.
 */
function findingPage(
  f: FindingFull, brand: Brand, audit: Audit, page: number, d: DepthSpec, sheetUrl?: string | null,
): string {
  // Everything past the depth budget is not on the page at all, so the fit
  // pass has far less to do. What it still marks droppable is the tail of
  // what the budget allowed, for the finding that runs long even so.
  const keepM = Math.max(2, Math.floor(d.measurements / 2))
  const keepE = d.exhibits > 0 ? 1 : 0
  const keepS = Math.max(3, Math.floor(d.steps / 2))
  const drop = (i: number, keep: number, base: number) =>
    i < keep ? '' : ` data-p="${base + i}" data-kind="${base}"`

  const rows = f.measurements.slice(0, d.measurements)
    .map(
      (m, i) =>
        `<tr${drop(i, keepM, 50)}><td><span>${esc(m.check)}</span></td><td class="num">${esc(m.result)}</td><td class="dt">${esc(m.taken)}</td></tr>`,
    )
    .join('')
  const steps = f.steps
    .slice(0, d.steps)
    .map((st, i) => `<li${drop(i, keepS, 10)}>${esc(st)}</li>`)
    .join('')
  const exhibits = f.examples
    .slice(0, d.exhibits)
    .map((e, i) => {
      const body =
        e.kind === 'markup' || e.kind === 'response'
          ? `<div class="code">${clampExtract(e.extract ?? '', d.extractLines)}</div>`
          : e.image_path
            ? `<div class="imgslot" data-path="${esc(e.image_path)}"></div>`
            : ''
      return `<div class="evfig"${drop(i, keepE, 100)}>${body}<div class="evcap"><span class="n">${i + 1}</span>
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
  ${sheetUrl
    ? `<p class="record">The full record for this finding, with every measurement and exhibit,
        is in the register: <span class="u">${esc(sheetUrl)}</span></p>`
    : ''}
  <p class="dropnote clip" hidden></p>
  <div class="foot"><span>Findings</span><span>${esc(brand.name)} / ${esc(audit.title)}</span><span>${page}</span></div>
</div></div>`
}

const row = (k: string, v: unknown, small = false) =>
  v == null || v === ''
    ? ''
    : `<div class="row"><div class="k">${esc(k)}</div><div class="v${small ? ' s' : ''}">${esc(v)}</div></div>`


const PILLAR_OF = (f: FindingFull) => f.pillar ?? 'Unsorted'

/** What we found: the shape of the audit before any of the detail. */
function summaryPage(findings: FindingFull[], counts: Record<string, number>): string {
  const effort = findings.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)
  const byPillar = new Map<string, number>()
  for (const f of findings) byPillar.set(PILLAR_OF(f), (byPillar.get(PILLAR_OF(f)) ?? 0) + 1)
  const top = [...findings].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 5)

  const bands = (['P1', 'P2', 'P3', 'P4'] as const).map((b) => `
    <div class="sumband"><b>${counts[b] ?? 0}</b><span>${b}</span></div>`).join('')

  const pillars = [...byPillar.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `<tr><td>${esc(p)}</td><td class="num">${n}</td></tr>`)
    .join('')

  const rows = top.map((f) => `<tr>
      <td class="dt">${esc(f.ref)}</td>
      <td>${esc(f.title)}</td>
      <td class="num">${f.score ?? '--'}</td>
    </tr>`).join('')

  return `<div class="page"><div class="pg">
    <div class="sect">What we found</div>
    <h1 class="ttl">${findings.length} findings, ${effort} engineering days of work</h1>
    <div class="sumbands">${bands}</div>
    <div class="sect mt">Where they sit</div>
    <table class="ev tbl-pillar"><tbody>${pillars}</tbody></table>
    <div class="sect mt">Highest scoring</div>
    <table class="ev tbl-top"><tbody>${rows}</tbody></table>
  </div></div>`
}

/** How the audit was done, and what it could not see. */
function methodPage(audit: Audit): string {
  const sources = (audit.sources ?? []).map((s) => `<tr>
      <td>${esc(s.tool)}</td><td class="dt">${esc(s.window)}</td><td class="dt">${esc(s.confidence)}</td>
    </tr>`).join('')

  return `<div class="page"><div class="pg">
    <div class="sect">Method and scope</div>
    <h1 class="ttl">How this was done</h1>
    ${audit.scope_note ? `<p class="body mt">${esc(audit.scope_note)}</p>` : ''}
    ${sources ? `<div class="sect mt">What it was built from</div>
      <table class="ev tbl-src"><thead><tr><th>Source</th><th>Window</th><th>Confidence</th></tr></thead>
      <tbody>${sources}</tbody></table>` : ''}
    ${audit.gaps ? `<div class="sect mt">What it could not see</div>
      <p class="body">${esc(audit.gaps)}</p>` : ''}
    <div class="sect mt">How priority is worked out</div>
    <p class="body">Every finding is scored the same way, so the ordering is arithmetic
      rather than opinion. Effort sits under a square root deliberately: dividing by it
      outright would make the register recommend nothing but trivia.</p>
    <div class="formula">score = 3 &times; (severity &times; reach &times; confidence &times; leverage)
      &divide; sqrt(effort) &times; risk factor, capped at 100</div>
    <p class="body">The band is a position inside this audit rather than a fixed number:
      P1 is the most urgent work here, not a score above some threshold. Two findings that
      score the same always share a band. The score itself is on every page, so this audit
      stays comparable with another.</p>
    <table class="ev tbl-band"><thead><tr><th>Band</th><th>Share of this audit</th><th>What it means</th></tr></thead><tbody>
      <tr><td class="dt">P1</td><td class="num">Top 15%</td><td>Do this first</td></tr>
      <tr><td class="dt">P2</td><td class="num">Next 25%</td><td>Scheduled work</td></tr>
      <tr><td class="dt">P3</td><td class="num">Next 30%</td><td>Do alongside</td></tr>
      <tr><td class="dt">P4</td><td class="num">The rest</td><td>Monitor</td></tr>
    </tbody></table>
  </div></div>`
}

/** The work, grouped into waves. */
function roadmapPage(findings: FindingFull[]): string {
  const waves = new Map<number, FindingFull[]>()
  for (const f of findings) {
    const w = f.wave ?? 99
    if (!waves.has(w)) waves.set(w, [])
    waves.get(w)!.push(f)
  }
  const total = findings.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)

  const blocks = [...waves.entries()].sort((a, b) => a[0] - b[0]).map(([w, items]) => {
    const eff = items.reduce((n, f) => n + Number(f.effort_days ?? 0), 0)
    const rows = items.map((f) => `<tr>
        <td class="dt">${esc(f.ref)}</td>
        <td>${esc(f.title)}</td>
        <td class="dt">${esc(f.owner ?? 'unassigned')}</td>
        <td class="num">${f.effort_days ?? '--'}</td>
      </tr>`).join('')
    return `<div class="wave">
      <div class="wavehd"><span>${w === 99 ? 'Unscheduled' : `Wave ${w}`}</span>
        <span class="dt">${items.length} ${items.length === 1 ? 'finding' : 'findings'}
          &nbsp;·&nbsp; ${eff} ${eff === 1 ? 'day' : 'days'}</span></div>
      <table class="ev tbl-wave"><tbody>${rows}</tbody></table>
    </div>`
  }).join('')

  return `<div class="page"><div class="pg">
    <div class="sect">Roadmap</div>
    <h1 class="ttl">${total} engineering days, in ${waves.size} ${waves.size === 1 ? 'wave' : 'waves'}</h1>
    ${blocks}
  </div></div>`
}

/** For a client who has not had one of these before. */
function appendixPage(): string {
  return `<div class="page"><div class="pg">
    <div class="sect">How to read this</div>
    <h1 class="ttl">What each part of a finding page is telling you</h1>
    <table class="ev"><tbody>
      <tr><td class="dt">The title</td><td>Stated as a claim, so it is something you can agree
        or disagree with rather than a topic.</td></tr>
      <tr><td class="dt">The evidence</td><td>Each check we ran, what it returned, and the date.
        Every number in the document traces back to one of these rows.</td></tr>
      <tr><td class="dt">The exhibits</td><td>The problem shown in place, so you do not have to
        go looking for it.</td></tr>
      <tr><td class="dt">The score</td><td>Built from severity, how much of the site is affected,
        how strong the evidence is, how much other work it unblocks, the effort, and the risk of
        the fix itself. Not a typed opinion.</td></tr>
      <tr><td class="dt">Effort</td><td>Engineering days, estimated. It feeds the score, which is
        why a cheap fix can outrank a more serious problem that takes a quarter.</td></tr>
      <tr><td class="dt">Verify by</td><td>The date the check should be re-run. The check itself
        was written before the fix, so it is a real test rather than one chosen to pass.</td></tr>
    </tbody></table>
    <p class="body mt">If a finding says something you know to be wrong, say so. The record is
      built to be argued with, and a corrected finding is worth more than a polite one.</p>
  </div></div>`
}

export function buildPrintDocument(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
  byline: string,
  /** Signed URL for the brand logo. Resolved by the caller, because the
   *  bucket is private and this function is pure. */
  logoUrl?: string | null,
  /** The register this document is the argument for. Printed on each finding
   *  page, so "the rest is in the sheet" is a link rather than a claim. */
  sheetUrl?: string | null,
): string {
  const d = depthOf(audit)
  // exposure exists so a finding can stay in the register without reaching the
  // client. The document was printing them anyway, which made the flag a lie.
  const ordered = clientFindings(findings).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 } as Record<string, number>
  for (const f of ordered) if (f.band) counts[f.band]++

  const id = identityOf(brand)
  const pal = reportPalette(id)

  // The brand's own colours and faces, injected as variables the print
  // stylesheet already reads. A pale brand colour would make white cover text
  // unreadable, so what goes on top is decided by contrast, not assumed.
  const brandCss = `<style>
    @import url('${fontHref(id)}');
    :root{
      --brand:${pal.primary}; --brand-on:${pal.onPrimary}; --brand-ink:${pal.ink};
      --brand-accent:${pal.accent}; --brand-wash:${pal.wash}; --brand-rule:${pal.rule};
      --disp:'${id.type.display}',Georgia,serif; --body:'${id.type.body}',Arial,sans-serif;
      --teal-d:${pal.accent};
    }
    .cover{background:${pal.primary};color:${pal.onPrimary}}
    .cover .chip{background:transparent;border:1px solid ${pal.onPrimary};color:${pal.onPrimary}}
    .cover .cvtitle,.cover .cvsub,.cover .cvstats b,.cover .cvstats span,.cover .cvfoot{color:${pal.onPrimary}}
    .cover .cvstats{border-top:1px solid ${pal.onPrimary}55;border-bottom:1px solid ${pal.onPrimary}55}
    .cvlogo{max-height:16mm;max-width:70mm;margin-bottom:auto}
    .cvslogan{font-family:var(--disp);font-size:13pt;font-weight:500;opacity:.85;margin:3mm 0 0}
    .cvcontact{font-family:var(--mono);font-size:7.6pt;letter-spacing:.1em;text-transform:uppercase;
      opacity:.75;margin:7mm 0 0}
  </style>`

  const logo = logoUrl
    ? `<img class="cvlogo" src="${esc(logoUrl)}" alt="${esc(brand.name)}">`
    : '<div class="cvlogo"></div>'

  const contact = id.contact.name
    ? `<p class="cvcontact">Prepared for ${esc(id.contact.name)}${id.contact.role ? `, ${esc(id.contact.role)}` : ''}</p>`
    : ''

  const cover = `${brandCss}<div class="page"><div class="pg cover">
    ${logo}
    <div class="chip">${esc(kindOf(audit))}</div>
    <h1 class="cvtitle">${esc(audit.title)}</h1>
    <p class="cvsub">${esc(id.legal_name ?? brand.name)}${brand.domain ? ` &nbsp;·&nbsp; ${esc(brand.domain)}` : ''}</p>
    ${id.slogan ? `<p class="cvslogan">${esc(id.slogan)}</p>` : ''}
    <div class="cvstats">
      <div><b>${ordered.length}</b><span>Findings</span></div>
      <div><b>${counts.P1}</b><span>P1, do first</span></div>
      <div><b>${counts.P2}</b><span>P2, scheduled</span></div>
      <div><b>${audit.urls_crawled != null ? audit.urls_crawled.toLocaleString('en-US') : '--'}</b><span>URLs crawled</span></div>
    </div>
    ${contact}
    <div class="cvfoot"><span>${esc(byline)}</span><span>${esc(audit.delivered_on ?? new Date().toISOString().slice(0, 10))}</span></div>
  </div></div>`

  const index = (folio: number) => `<div class="page"><div class="pg">
    <div class="sect">Document index</div>
    <h1 class="ttl">Findings, In Priority Order</h1>
    <table class="idx">${ordered
      .map(
        (f, i) =>
          `<tr><td class="n">${i + 1}</td><td>${esc(f.title)}</td><td class="b">${esc(f.band ?? '')}</td><td class="s">${f.score ?? ''}</td></tr>`,
      )
      .join('')}</table>
    <div class="foot"><span>Front matter</span><span>${esc(brand.name)} / ${esc(audit.title)}</span><span>${folio}</span></div>
  </div></div>`

  // Page numbers used to be constants: the contents page said 2 and findings
  // counted from 3. That was only ever right for one arrangement of sections,
  // and the whole point of the export dialog is that you can choose them and
  // reorder them. With the defaults on it was already wrong by two, so a
  // client reading "page 5" in the footer was looking at the seventh sheet.
  // The folio is now counted off the sections that are actually in the
  // document, in the order they actually appear.
  const sheets: Record<SectionKey, number> = {
    cover: 1, summary: 1, contents: 1, method: 1,
    findings: ordered.length, roadmap: 1, appendix: 1,
  }

  const built: Record<SectionKey, (folio: number) => string> = {
    cover: () => cover,
    summary: () => summaryPage(ordered, counts),
    contents: (folio) => index(folio),
    method: () => methodPage(audit),
    findings: (folio) =>
      ordered.map((f, i) => findingPage(f, brand, audit, folio + i, d, sheetUrl)).join(''),
    roadmap: () => roadmapPage(ordered),
    appendix: () => appendixPage(),
  }

  // The cover carries the brand variables, so when it is switched off the
  // style block still has to lead or the rest of the document loses the kit.
  const chosen = sectionsOf(audit).filter((s) => s.on)
  let folio = 1
  const body = chosen
    .map((s) => {
      const html = built[s.key]?.(folio) ?? ''
      folio += sheets[s.key] ?? 1
      return html
    })
    .join('')
  return chosen[0]?.key === 'cover' ? body : `${brandCss}${body}`
}

/**
 * Fit every page onto one page.
 *
 * A finding carries however much evidence it carries. Rather than clipping at
 * the page edge, which is what a fixed height box does silently, each page's
 * content is measured once the fonts have settled and scaled down until it
 * fits. Width is compensated as it scales, so the text gets smaller and the
 * column stays the same measure.
 *
 * There is a floor. Below it the page would be unreadable, so it stops there
 * and the overflow is allowed to show rather than pretending it fitted.
 */
const FIT_FLOOR = 0.74

export const FIT_SCRIPT = `
(function () {
  var FLOOR = ${FIT_FLOOR};
  var NAME = { '100': 'exhibit', '50': 'measurement', '10': 'step' };

  document.querySelectorAll('.page > .pg').forEach(function (box) {
    var fit = box.querySelector(':scope > .fit');
    if (!fit) {
      fit = document.createElement('div');
      fit.className = 'fit';
      // The running footer stays outside the wrapper. A transformed element
      // becomes the containing block for its absolutely positioned
      // descendants, so scaling the wrapper would drag the footer up the page
      // with it and land it on top of the content.
      var kids = [];
      for (var k = 0; k < box.children.length; k++) kids.push(box.children[k]);
      kids.forEach(function (el) { if (!el.classList.contains('foot')) fit.appendChild(el); });
      box.insertBefore(fit, box.firstChild);
    }
    var cs = getComputedStyle(box);
    var avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var note = fit.querySelector('.dropnote');

    var reset = function () { fit.style.transform = ''; fit.style.width = '100%'; };
    reset();

    // Drop the heaviest optional material until what remains can be scaled
    // into the page without going below the floor. Highest priority first,
    // so extra exhibits go before extra measurements, and steps go last.
    var cut = {};
    for (var guard = 0; guard < 40; guard++) {
      if (fit.scrollHeight <= avail / FLOOR) break;
      var worst = null;
      fit.querySelectorAll('[data-p]').forEach(function (el) {
        if (!worst || +el.getAttribute('data-p') > +worst.getAttribute('data-p')) worst = el;
      });
      if (!worst) break;
      var kind = worst.getAttribute('data-kind') || '10';
      cut[kind] = (cut[kind] || 0) + 1;
      worst.parentNode.removeChild(worst);
      if (note) {
        var bits = [];
        Object.keys(cut).sort(function (a, b) { return b - a; }).forEach(function (k) {
          var n = cut[k], w = NAME[k] || 'item';
          bits.push(n + ' ' + (n === 1 ? w : w + 's'));
        });
        note.textContent = bits.join(', ') + ' not shown here. The full record is in the register.';
        note.hidden = false;
      }
    }

    // Nothing droppable left and still too tall. That means the overflow is
    // all material the page is not allowed to remove: the title, the basis,
    // the first four measurements, the first five steps. Shorten the prose to
    // a line count that fits, and say so. Visible truncation beats silent
    // clipping at the page edge, which is what this whole pass exists to stop.
    if (fit.scrollHeight > avail / FLOOR) {
      var clamps = [10, 8, 6, 5, 4, 3, 2];
      fit.classList.add('clamped');
      for (var c = 0; c < clamps.length; c++) {
        fit.style.setProperty('--cl', clamps[c]);
        if (fit.scrollHeight <= avail / FLOOR) break;
      }
      if (note) {
        note.textContent = (note.hidden ? '' : note.textContent.replace(/\.$/, '') + '. ') +
          'Some wording is shortened to fit. The full text is in the register.';
        note.hidden = false;
      }
    }

    if (fit.scrollHeight <= avail) { reset(); return; }

    // Binary search the scale. Compensating the width reflows the text, which
    // changes the height, so it cannot be solved by one division.
    var lo = FLOOR, hi = 1, s = FLOOR;
    for (var i = 0; i < 8; i++) {
      var mid = (lo + hi) / 2;
      fit.style.width = (100 / mid) + '%';
      fit.style.transform = 'scale(' + mid + ')';
      if (fit.scrollHeight * mid <= avail) { s = mid; lo = mid; } else { hi = mid; }
    }
    fit.style.width = (100 / s) + '%';
    fit.style.transform = 'scale(' + s + ')';
  });
})();
  document.documentElement.setAttribute('data-fit','done');

`


/**
 * The same document, as one self contained file.
 *
 * printDocument builds this in a popup and throws it away. A headless renderer
 * needs the identical bytes, fit pass included, so the stored PDF is the same
 * artifact the print dialog would have produced rather than a second rendering
 * that drifts from it.
 */
export function buildStandaloneDocument(html: string, css: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style></head><body>${html}
<script>(function(){
  var run = function () { try { ${FIT_SCRIPT} } catch (e) {
    document.documentElement.setAttribute('data-fit','failed');
  } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ setTimeout(run, 120) });
  else setTimeout(run, 600);
})();<\/script></body></html>`
}

/** Opens a print window containing only the document, fits each page, prints. */
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
  const go = () => setTimeout(() => {
    // Measure after the faces have loaded. Fitting against fallback metrics
    // produces a scale that is wrong for the document that actually prints.
    try {
      const s = w.document.createElement('script')
      s.textContent = FIT_SCRIPT
      w.document.body.appendChild(s)
    } catch {
      /* if it cannot fit, print unfitted rather than not at all */
    }
    setTimeout(() => w.print(), 120)
  }, 250)
  if (w.document.fonts) w.document.fonts.ready.then(go)
  else setTimeout(go, 600)
}
