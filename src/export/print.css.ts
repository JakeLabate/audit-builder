/**
 * Print stylesheet for the exported audit. Kept as a TS string so it ships
 * with the bundle and can be injected into the print window.
 * Geometry and tokens match the document system the PDFs were designed in.
 *
 * Nothing here assumes a field is filled. Every block is built only when it
 * has something to say, so the rules below describe blocks that may or may
 * not be on the page, in any combination, and none of them leaves a gap or an
 * empty box behind when it is absent.
 */
export const PRINT_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:210mm 297mm;margin:0}
:root{
  --ink:#191A3E; --ink2:#2B2C63; --teal:#0E8C8B; --teal-d:#0A6C6B;
  /* Overridden per brand by the block buildPrintDocument injects. */
  --brand:#191A3E; --brand-on:#fff; --brand-ink:#12132B;
  --brand-accent:#0E8C8B; --brand-wash:#F2F4F3; --brand-rule:#D7DCD9;
  --paper:#fff; --wash:#F4F4F9; --line:#DFDFEA; --muted:#6C6D91; --amber:#A9720C; --crim:#8A1C2B;
  --disp:'Space Grotesk',Arial,sans-serif; --body:'IBM Plex Sans',Arial,sans-serif;
  --mono:'IBM Plex Mono',monospace;
}
html,body{width:210mm;background:#fff;color:var(--ink);font-family:var(--body);font-size:10.5pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
.pg{padding:17mm 18mm 24mm;height:100%;display:flex;flex-direction:column}
/* Everything that flows sits in here, so the layout pass has one element to
   measure. When a page runs long its trailing blocks move to a new page. */
.flow{flex:none;transform-origin:top left;width:100%}

/* ---- shared pieces ---- */
.hd{display:flex;align-items:center;gap:4mm;margin-bottom:5mm}
.hd .sp{flex:1}
.tag{display:inline-block;font-family:var(--mono);font-size:7.4pt;font-weight:600;letter-spacing:.15em;text-transform:uppercase;padding:2.2mm 3mm;border-radius:1mm;line-height:1;color:#fff;background:var(--ink)}
.tag.crit{background:var(--crim)} .tag.high{background:var(--amber)}
.tag.med{background:var(--wash);color:var(--ink2);border:1px solid var(--line)}
.idl{font-family:var(--mono);font-size:8pt;letter-spacing:.11em;color:var(--muted);text-transform:uppercase}
.ttl{font-family:var(--disp);font-weight:700;font-size:18.5pt;line-height:1.16;letter-spacing:-.015em;max-width:164mm}
.sect{font-family:var(--mono);font-size:7.6pt;letter-spacing:.19em;text-transform:uppercase;color:var(--teal-d);margin-bottom:2.6mm;padding-bottom:1.6mm;border-bottom:1px solid var(--line)}
.blk{margin-top:6mm}
.blk.tight{margin-top:2mm}
.body{font-size:10pt;line-height:1.52;color:var(--ink2);max-width:162mm;overflow-wrap:anywhere}
.body+.body{margin-top:2.6mm}
.body a,.note a,.evmeta a,.record a{color:var(--brand-accent);text-decoration:none;overflow-wrap:anywhere}
.note{font-size:8.6pt;line-height:1.5;color:var(--muted);max-width:162mm;overflow-wrap:anywhere}
.note b{color:var(--ink2);font-weight:600}
.note+.note{margin-top:1.2mm}

/* Continuation header, on the page a long finding or section runs onto. */
.conthd{display:flex;align-items:baseline;gap:4mm;padding-bottom:2.6mm;border-bottom:1px solid var(--line);margin-bottom:1mm}
.conthd .ct{flex:1;font-family:var(--disp);font-weight:600;font-size:10.5pt;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.conthd .cc{font-family:var(--mono);font-size:7.2pt;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.conthd+.blk{margin-top:5mm}

/* ---- finding: the facts strip ----
   One cell per fact that exists. The cells share a row and stretch to fill
   it, so three facts or eleven both come out as a closed block with no hole
   where a missing one would have been. */
.facts{display:flex;flex-wrap:wrap;gap:1px;margin-top:5mm;background:var(--line);border:1px solid var(--line);border-radius:1.5mm;overflow:hidden}
.fact{flex:1 1 40mm;background:var(--wash);padding:2.6mm 4mm;min-width:0}
.fact .k{font-family:var(--mono);font-size:6.6pt;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:1mm}
.fact .v{font-size:9.6pt;font-weight:500;color:var(--ink);line-height:1.3;overflow-wrap:anywhere}
.fact.lead{background:var(--ink);flex:0 0 46mm}
.fact.lead .k{color:#fff;opacity:.7}
.fact.lead .v{font-family:var(--disp);font-weight:700;font-size:20pt;line-height:1;letter-spacing:-.02em;color:#fff}
.fact.lead .v small{font-family:var(--mono);font-weight:500;font-size:8pt;letter-spacing:.08em;margin-left:2.5mm;opacity:.8}
.fact.lead .s{font-size:8.2pt;color:#fff;opacity:.8;margin-top:1.2mm}

/* ---- evidence ---- */
.ev{width:100%;border-collapse:collapse;font-size:9.6pt}
.ev td,.ev th{padding:2.1mm 0;border-bottom:1px solid var(--line);color:var(--ink2);vertical-align:top;text-align:left;overflow-wrap:anywhere}
.ev tr:last-child td{border-bottom:0}
.ev th{font-family:var(--mono);font-weight:500;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding-top:0}
.ev td.ck{width:34%;padding-right:6mm;color:var(--ink);font-weight:500}
.ev td.tool{width:1%;white-space:nowrap;padding-left:5mm;text-align:right;font-family:var(--mono);font-size:7.2pt;line-height:1.45;letter-spacing:.03em;color:var(--muted)}
.ev td.rs{color:var(--ink2)}
.ev td.num{font-family:var(--mono);text-align:right;white-space:nowrap;color:var(--ink);padding-left:4mm}
.ev td.dt{font-family:var(--mono);color:var(--muted);font-size:8.2pt;padding-right:4mm}
.ev td.sub{color:var(--ink)}
.ev td.sub .s{display:block;margin-top:.5mm;font-size:8.2pt;line-height:1.4;color:var(--muted)}

.evfig{margin-top:3.5mm;border:1px solid var(--line);border-radius:1.5mm;overflow:hidden;background:#fff;break-inside:avoid}
.evfig:first-child{margin-top:0}
/* An exhibit with no picture and no extract is a reference, not a figure:
   a line in a list rather than a box with nothing in it. */
.evfig.ref{border:0;border-radius:0;border-bottom:1px solid var(--line);margin-top:0}
.evfig.ref:last-child{border-bottom:0}
.evfig.ref .evcap{padding:2mm 0 .6mm}
.evfig.ref .evmeta{padding:0 0 2mm 9mm}
.evfig.ref+.evfig:not(.ref),.evfig:not(.ref)+.evfig.ref{margin-top:3mm}
.figimg{background:var(--wash);padding:3mm;border-bottom:1px solid var(--line)}
.figimg img{display:block;max-width:100%;max-height:var(--figh,80mm);width:auto;height:auto;margin:0 auto;border:1px solid var(--line)}
.code{background:var(--wash);padding:3.5mm 4.5mm;font-family:var(--mono);font-size:7.8pt;line-height:1.7;color:var(--ink2);white-space:pre-wrap;word-break:break-all;border-bottom:1px solid var(--line)}
.evcap{display:flex;gap:3mm;align-items:baseline;padding:2.6mm 4mm}
.evcap .n{font-family:var(--mono);font-size:7.2pt;color:#fff;background:var(--ink);border-radius:1mm;padding:1.1mm 2mm;letter-spacing:.08em;flex:none}
.evcap .t{font-size:9.2pt;line-height:1.45;color:var(--ink2);flex:1;overflow-wrap:anywhere}
.evcap .m{font-family:var(--mono);font-size:6.8pt;color:var(--muted);letter-spacing:.08em;flex:none}
.evmeta{padding:0 4mm 2.6mm 13mm;font-family:var(--mono);font-size:7.2pt;line-height:1.5;color:var(--muted);overflow-wrap:anywhere}
.figs.two{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm;align-items:start}
.figs.two .evfig{margin-top:0}
.figs.two .evfig.wide,.figs.two .evfig.ref{grid-column:1/-1}
.figs.two .figimg{padding:2mm}
.figs.two .evcap{padding:2.2mm 3mm;gap:2.4mm}
.figs.two .evcap .t{font-size:8.6pt}
.figs.two .evmeta{padding:0 3mm 2.2mm 3mm}
.conthd+.fix{border-top:0;padding-top:0}
.clip{display:block;margin-top:1.5mm;font-style:italic;color:var(--muted);font-size:7.6pt}

/* ---- the fix ---- */
.fix{border-top:2px solid var(--ink);padding-top:3.6mm}
.fix .sect{border:0;padding:0;margin-bottom:2.4mm}
.fixlead{font-family:var(--disp);font-weight:600;font-size:11.5pt;line-height:1.3;letter-spacing:-.005em;color:var(--ink);max-width:162mm;overflow-wrap:anywhere}
.steps{margin-top:3.4mm}
.steps li{list-style:none;position:relative;padding-left:8mm;margin-bottom:2.2mm;font-size:9.8pt;line-height:1.48;color:var(--ink2);overflow-wrap:anywhere}
.steps li:last-child{margin-bottom:0}
.steps li .sn{position:absolute;left:0;top:.2mm;font-family:var(--mono);font-size:7.6pt;color:var(--teal-d);border:1px solid var(--teal-d);border-radius:50%;width:5.2mm;height:5.2mm;display:flex;align-items:center;justify-content:center}
.fixlead+.steps{margin-top:3.4mm}
.sect+.steps{margin-top:0}

.record{margin-top:5mm;font-size:7.8pt;color:var(--muted);line-height:1.4}

.foot{position:absolute;left:18mm;right:18mm;bottom:9mm;display:flex;justify-content:space-between;gap:6mm;font-family:var(--mono);font-size:7.4pt;color:var(--muted);letter-spacing:.1em;border-top:1px solid var(--line);padding-top:2.5mm}
.foot span:nth-child(2){flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ---- cover ---- */
.cover{display:flex;flex-direction:column;justify-content:flex-end}
.chip{align-self:flex-start;font-family:var(--mono);font-size:8.4pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;background:var(--ink);color:#fff;padding:2.6mm 3.6mm;border-radius:1mm;margin-bottom:6mm}
.cvtitle{font-family:var(--disp);font-weight:700;font-size:34pt;line-height:1.06;letter-spacing:-.025em;max-width:150mm}
.cvsub{margin-top:4mm;font-size:12pt;color:var(--muted)}
.cvstats{display:flex;gap:14mm;margin-top:14mm;padding-top:7mm;border-top:1px solid var(--line)}
.cvstats b{display:block;font-family:var(--disp);font-weight:700;font-size:22pt;letter-spacing:-.02em;line-height:1}
.cvstats span{font-family:var(--mono);font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cvfoot{display:flex;justify-content:space-between;margin-top:16mm;padding-top:3mm;border-top:1px solid var(--line);font-family:var(--mono);font-size:8pt;color:var(--muted);letter-spacing:.1em}

/* ---- contents ---- */
.idx{width:100%;border-collapse:collapse;font-size:10pt}
.idx th{font-family:var(--mono);font-weight:500;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-align:left;padding:0 0 1.6mm;border-bottom:1px solid var(--line)}
.idx th.r{text-align:right}
.idx td{padding:2.6mm 0;border-bottom:1px solid var(--line);vertical-align:top}
.idx td.n{width:9mm;font-family:var(--mono);font-size:8.4pt;color:var(--muted);padding-top:3mm}
.idx td.t{padding-right:6mm;overflow-wrap:anywhere}
.idx td.t .r{display:block;margin-top:.6mm;font-family:var(--mono);font-size:7.4pt;letter-spacing:.06em;color:var(--muted)}
.idx td.b{width:12mm;font-family:var(--mono);font-size:8.4pt;color:var(--teal-d);text-align:right;padding-top:3mm}
.idx td.s{width:12mm;font-family:var(--mono);font-size:8.4pt;text-align:right;padding-top:3mm}
.idx td.p{width:12mm;font-family:var(--mono);font-size:9pt;text-align:right;color:var(--ink);padding-top:2.8mm}

/* ---- summary, method, roadmap, appendix ---- */
.sumbands{display:flex;gap:4mm}
.sumband{
  flex:1;border:1px solid var(--line);border-radius:1mm;padding:5mm 4mm;text-align:center;
  background:var(--brand-wash);
}
.sumband b{display:block;font-family:var(--disp);font-weight:700;font-size:20pt;line-height:1;color:var(--brand-ink)}
.sumband span{
  font-family:var(--mono);font-size:7.2pt;letter-spacing:.14em;color:var(--muted);
  text-transform:uppercase;margin-top:2mm;display:block;
}
.formula{
  background:var(--brand-wash);border:1px solid var(--brand-rule);border-radius:1mm;
  padding:5mm;margin:4mm 0;font-family:var(--mono);font-size:8.6pt;text-align:center;
  color:var(--brand-ink);line-height:1.6;
}
.wavehd{
  display:flex;justify-content:space-between;align-items:baseline;
  border-bottom:1.5px solid var(--brand);padding-bottom:2mm;margin-bottom:0;
  font-family:var(--disp);font-weight:600;font-size:11pt;color:var(--brand-ink);
}
.wavehd .dt{font-family:var(--mono);font-size:8pt;font-weight:400;color:var(--muted)}
.tbl-cat td:first-child{width:38mm;color:var(--ink);font-weight:500}
.tbl-top td.dt{width:50mm;white-space:nowrap}
.tbl-src td:first-child{color:var(--ink)}
.tbl-band td:first-child{width:18mm}
.tbl-band td:nth-child(2){width:34mm}
.tbl-road{table-layout:fixed}
.tbl-road col.c-ref{width:50mm}
.tbl-road col.c-own{width:40mm}
.tbl-road col.c-eff{width:20mm}
.tbl-road td{padding:2mm 0}
.tbl-road td.dt{padding-right:5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tbl-road td.own{padding-left:5mm;font-size:8.8pt}
.tbl-read td:first-child{width:36mm;color:var(--ink);font-weight:500;padding-right:5mm}
`
