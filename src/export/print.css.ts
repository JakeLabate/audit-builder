/**
 * Print stylesheet for the exported audit. Kept as a TS string so it ships
 * with the bundle and can be injected into the print window.
 * Geometry and tokens match the document system the PDFs were designed in.
 */
export const PRINT_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:210mm 297mm;margin:0}
:root{
  --ink:#191A3E; --ink2:#2B2C63; --teal:#0E8C8B; --teal-d:#0A6C6B;
  --paper:#fff; --wash:#F4F4F9; --line:#DFDFEA; --muted:#6C6D91; --amber:#A9720C; --crim:#8A1C2B;
  --disp:'Space Grotesk',Arial,sans-serif; --body:'IBM Plex Sans',Arial,sans-serif;
  --mono:'IBM Plex Mono',monospace;
}
html,body{width:210mm;background:#fff;color:var(--ink);font-family:var(--body);font-size:10.5pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
.pg{padding:17mm 18mm 15mm;height:100%}
.hd{display:flex;align-items:center;gap:4mm;margin-bottom:7mm}
.tag{display:inline-block;font-family:var(--mono);font-size:7.4pt;font-weight:600;letter-spacing:.15em;text-transform:uppercase;padding:2.2mm 3mm;border-radius:1mm;line-height:1;color:#fff}
.tag.crit{background:var(--crim)} .tag.high{background:var(--amber)}
.tag.med{background:var(--wash);color:var(--ink2);border:1px solid var(--line)}
.idl{font-family:var(--mono);font-size:8pt;letter-spacing:.13em;color:var(--muted);text-transform:uppercase}
.ttl{font-family:var(--disp);font-weight:700;font-size:20pt;line-height:1.16;letter-spacing:-.015em;max-width:150mm}
.sect{font-family:var(--mono);font-size:7.6pt;letter-spacing:.19em;text-transform:uppercase;color:var(--teal-d);margin-bottom:2.6mm;padding-bottom:1.6mm;border-bottom:1px solid var(--line)}
.sect.mt{margin-top:7mm} .sect.nb{border:0;padding:0}
.body{font-size:10.2pt;line-height:1.58;color:var(--ink2);max-width:158mm}
.split{display:grid;grid-template-columns:1fr 54mm;gap:0 9mm;margin-top:6mm}
.rail{background:var(--wash);padding:5mm;border-radius:1.5mm}
.rail .row{padding:2.6mm 0;border-top:1px solid var(--line)}
.rail .row:first-child{border-top:0;padding-top:0}
.rail .k{font-family:var(--mono);font-size:6.8pt;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:1mm}
.rail .v{font-family:var(--disp);font-weight:600;font-size:11.5pt;color:var(--ink);letter-spacing:-.01em;line-height:1.15}
.rail .v.s{font-size:9.4pt;font-family:var(--body);font-weight:500;line-height:1.35}
.score{background:var(--ink);color:#fff;border-radius:1.5mm;padding:4mm 5mm;margin-bottom:4mm}
.score .n{font-family:var(--disp);font-weight:700;font-size:26pt;line-height:1;letter-spacing:-.03em}
.score .l{font-family:var(--mono);font-size:6.8pt;letter-spacing:.15em;text-transform:uppercase;opacity:.72;margin-top:1.5mm}
.ev{width:100%;border-collapse:collapse;font-size:9.4pt;margin-top:1mm}
.ev td{padding:2.2mm 0;border-top:1px solid var(--line);color:var(--ink2);vertical-align:top}
.ev td:first-child{color:var(--ink);width:52mm;padding-right:5mm}
.ev td.num{font-family:var(--mono);text-align:right;width:26mm;color:var(--ink)}
.ev td.dt{font-family:var(--mono);text-align:right;width:22mm;color:var(--muted);font-size:8.4pt}
.evfig{margin-top:4mm;border:1px solid var(--line);border-radius:1.5mm;overflow:hidden;background:var(--wash)}
.evfig img{display:block;width:100%}
.evcap{display:flex;gap:3mm;align-items:baseline;padding:3mm 4mm;background:#fff;border-top:1px solid var(--line)}
.evcap .n{font-family:var(--mono);font-size:7.2pt;color:#fff;background:var(--ink);border-radius:1mm;padding:1.2mm 2mm;letter-spacing:.08em;flex:none}
.evcap .t{font-size:9.2pt;line-height:1.45;color:var(--ink2);flex:1}
.evcap .m{font-family:var(--mono);font-size:6.8pt;color:var(--muted);letter-spacing:.08em;flex:none}
.code{background:var(--wash);padding:3.5mm 4.5mm;font-family:var(--mono);font-size:7.8pt;line-height:1.72;color:var(--ink2);white-space:pre-wrap;word-break:break-all}
.fixbar{margin-top:7mm;border-top:2px solid var(--ink);padding-top:4mm}
.steps{counter-reset:s;margin-top:3mm}
.steps li{list-style:none;counter-increment:s;position:relative;padding-left:8mm;margin-bottom:3.2mm;font-size:10pt;line-height:1.5;color:var(--ink2)}
.steps li::before{content:counter(s);position:absolute;left:0;top:.2mm;font-family:var(--mono);font-size:8pt;color:var(--teal-d);border:1px solid var(--teal);border-radius:50%;width:5.2mm;height:5.2mm;display:flex;align-items:center;justify-content:center}
.foot{position:absolute;left:18mm;right:18mm;bottom:9mm;display:flex;justify-content:space-between;font-family:var(--mono);font-size:7.4pt;color:var(--muted);letter-spacing:.1em;border-top:1px solid var(--line);padding-top:2.5mm}
.cover{display:flex;flex-direction:column;justify-content:flex-end}
.chip{align-self:flex-start;font-family:var(--mono);font-size:8.4pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;background:var(--ink);color:#fff;padding:2.6mm 3.6mm;border-radius:1mm;margin-bottom:6mm}
.cvtitle{font-family:var(--disp);font-weight:700;font-size:34pt;line-height:1.06;letter-spacing:-.025em;max-width:150mm}
.cvsub{margin-top:4mm;font-size:12pt;color:var(--muted)}
.cvstats{display:flex;gap:14mm;margin-top:14mm;padding-top:7mm;border-top:1px solid var(--line)}
.cvstats b{display:block;font-family:var(--disp);font-weight:700;font-size:22pt;letter-spacing:-.02em;line-height:1}
.cvstats span{font-family:var(--mono);font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cvfoot{display:flex;justify-content:space-between;margin-top:16mm;padding-top:3mm;border-top:1px solid var(--line);font-family:var(--mono);font-size:8pt;color:var(--muted);letter-spacing:.1em}
.idx{width:100%;border-collapse:collapse;margin-top:6mm;font-size:10pt}
.idx td{padding:2.8mm 0;border-bottom:1px solid var(--line);vertical-align:baseline}
.idx td.n{width:10mm;font-family:var(--mono);font-size:8.4pt;color:var(--muted)}
.idx td.b{width:14mm;font-family:var(--mono);font-size:8.4pt;color:var(--teal-d);text-align:right}
.idx td.s{width:14mm;font-family:var(--mono);font-size:9pt;text-align:right}
`
