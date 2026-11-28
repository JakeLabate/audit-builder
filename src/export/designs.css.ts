import type { PdfDesignKey } from '../lib/designs'

/**
 * The document designs.
 *
 * A design is a stylesheet laid over print.css, and nothing more. The markup,
 * the sections, the fields and the layout pass are the same for all of them,
 * which is what makes "same information, different look" a property of the
 * code rather than a promise: a design has no way to leave a field out.
 *
 * What every design has to keep, because the layout pass measures it:
 *   .page is one A4 sheet and clips. .pg is its padded box. .flow is the one
 *   element that holds everything that flows, and stays display:block or
 *   flow-root. .foot sits at the bottom of the sheet, outside the flow.
 * Anything else is the design's to change. A design may change .pg's padding:
 * the pass reads the box, so the space a band or a rail takes is accounted for.
 *
 * Colours come only from the variables buildPrintDocument injects from the
 * brand kit. No design names a colour of its own, apart from white paper and
 * the two severity colours, which mean the same thing in every brand.
 *
 *   --ink --ink2 --muted --line --wash   text and rules, tinted from the brand
 *   --brand / --brand-on                 the primary, and what reads on it
 *   --fill / --fill-on                   the primary as a band on white paper
 *   --rule                               the primary as a thin rule on white
 *   --accent / --accent-on               the accent as a fill
 *   --brand-accent                       the accent as small type on white
 *   --disp --body --mono                 the brand's faces
 *
 * The logo always sits on the brand colour. A logo is chosen against the
 * cover in the brand kit, so that is the one ground it is known to work on.
 *
 * Classic is print.css itself and has no entry here.
 */

/* ------------------------------------------------------------- editorial */
const EDITORIAL = `
.page:not([data-kind="cover"])::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2.6mm;background:var(--fill)}
.pg{padding:19mm 20mm 24mm 25mm}
.foot{left:25mm;right:20mm;border-top:0;padding-top:0;font-family:var(--body);font-size:7.8pt;letter-spacing:.02em}
.foot .folio{font-family:var(--disp);font-weight:600;font-size:9.5pt;color:var(--ink);letter-spacing:0}

.fhd .hd{margin-bottom:7mm;padding-bottom:2.6mm;border-bottom:1px solid var(--ink)}
.ttl{font-size:24pt;font-weight:600;line-height:1.1;letter-spacing:-.022em;max-width:158mm}
.tag{background:none;border:1px solid var(--ink);color:var(--ink);padding:1.7mm 2.6mm;border-radius:0}
.tag.crit{background:var(--crim);border-color:var(--crim);color:#fff}
.tag.high{background:none;border-color:var(--amber);color:var(--amber)}
.tag.med{background:none;border-color:var(--line);color:var(--ink2)}

.shd .sect{font-family:var(--body);font-size:8pt;font-weight:600;letter-spacing:.16em;color:var(--brand-accent);border-bottom:0;padding-bottom:0;margin-bottom:3mm}
.shd .note{margin-top:2.4mm}
.blk{margin-top:7mm}
.blk>.sect,.duo .sect{font-family:var(--disp);font-size:11pt;font-weight:600;letter-spacing:-.005em;text-transform:none;color:var(--ink);border-bottom:0;padding-bottom:0;margin-bottom:2.4mm}
.blk>.sect::before,.duo .sect::before{content:'';display:block;width:9mm;height:.7mm;background:var(--accent);margin-bottom:2.2mm}
.body{font-size:10.2pt;line-height:1.58}

.facts{background:none;border:0;border-top:2px solid var(--ink);border-radius:0;gap:0;margin-top:6mm}
.fact{background:none;padding:2.8mm 5mm 2.8mm 0;border-bottom:1px solid var(--line)}
.fact .k{font-family:var(--body);font-weight:600;font-size:6.4pt;letter-spacing:.12em}
.fact .v{font-family:var(--disp);font-size:10.6pt;font-weight:500}
.fact.lead{background:none}
.fact.lead .k{color:var(--muted);opacity:1}
.fact.lead .v{color:var(--brand-accent);font-size:22pt}
.fact.lead .v small{color:var(--muted);opacity:1}
.fact.lead .s{color:var(--ink2);opacity:1}

.evfig{border-radius:0}
.figimg{background:none}
.evcap .n{background:none;color:var(--brand-accent);padding:0;border-radius:0;font-size:7.6pt;letter-spacing:.1em}
.evcap .n::before{content:'EXHIBIT '}
.evfig:not(.ref) .evmeta{padding-left:4mm}
.evfig.ref .evmeta{padding-left:0}
.code{background:var(--wash)}

.fix{border-top:1px solid var(--ink);padding-top:5mm}
.fix>.sect::before{display:none}
.fixlead{font-size:13.5pt;font-weight:500;line-height:1.28;letter-spacing:-.01em}
.steps li{padding-left:9mm}
.steps li .sn{border:0;border-radius:0;width:auto;height:auto;top:-.3mm;font-family:var(--disp);font-weight:600;font-size:11pt;color:var(--brand-accent)}
.conthd{border-bottom:1px solid var(--ink)}

.sumband{background:none;border:0;border-top:2px solid var(--ink);border-radius:0;text-align:left;padding:3.4mm 0 0}
.sumband b{font-size:26pt;color:var(--ink)}
.formula{background:none;border:0;border-left:.7mm solid var(--accent);border-radius:0;text-align:left;padding:2mm 0 2mm 5mm}
.wavehd{border-bottom:1px solid var(--ink)}

.cover{background:#fff;color:var(--ink);justify-content:flex-start;padding:0 20mm 20mm 25mm}
.cover::before{content:'';position:absolute;left:0;right:0;top:0;height:78mm;background:var(--brand)}
.cvlogo{position:absolute;left:25mm;top:22mm;max-height:20mm;max-width:90mm;margin:0}
.cover .chip{margin:98mm 0 6mm;background:none;border:0;padding:0;border-radius:0;color:var(--brand-accent);font-family:var(--body);font-size:8.8pt;letter-spacing:.18em}
.cvtitle{font-size:42pt;font-weight:600;line-height:1.02;letter-spacing:-.03em;max-width:162mm;color:var(--ink)}
.cvsub{margin-top:7mm;font-size:12.5pt;color:var(--ink2)}
.cvslogan{font-style:italic;color:var(--muted);opacity:1}
.cvstats{margin-top:auto;padding-top:6mm;border-top:2px solid var(--ink);gap:0}
.cvstats>div{flex:1}
.cvstats b{font-size:27pt;color:var(--ink)}
.cvstats span{display:block;margin-top:1.6mm;color:var(--muted)}
.cvcontact{color:var(--ink2);opacity:1}
.cvfoot{margin-top:9mm;border-top:1px solid var(--line);color:var(--muted)}
`

/* ------------------------------------------------------------------ bold */
const BOLD = `
.pg{padding:0 18mm 24mm}
.fhd,.shd,.conthd{position:relative;z-index:0;color:var(--fill-on)}
.fhd::before,.shd::before,.conthd::before{content:'';position:absolute;z-index:-1;left:-40mm;right:-40mm;top:-40mm;bottom:0;background:var(--fill)}
.fhd,.shd{padding:14mm 0 9mm;margin-bottom:7mm}
.fhd .hd{margin-bottom:4.6mm}
.fhd .idl{color:inherit;opacity:.82}
.fhd .tag,.fhd .tag.crit,.fhd .tag.high,.fhd .tag.med{background:var(--fill-on);color:var(--fill);border:0}
.ttl{font-size:22pt;line-height:1.12;letter-spacing:-.02em;color:inherit;max-width:none}
.shd .sect{color:inherit;opacity:.84;border-bottom:0;padding-bottom:0;margin-bottom:3mm;font-weight:500}
.shd .note{color:inherit;opacity:.84;margin-top:2.6mm}
.conthd{padding:9mm 0 4.4mm;margin-bottom:6mm;border-bottom:0}
.conthd .ct{color:inherit}
.conthd .idl,.conthd .cc{color:inherit;opacity:.8}
.conthd+.blk{margin-top:0}

.blk>.sect,.duo .sect{display:flex;align-items:center;gap:2.4mm;font-family:var(--disp);font-size:8.4pt;font-weight:700;letter-spacing:.13em;color:var(--ink);border-bottom:0;padding-bottom:0;margin-bottom:3mm}
.blk>.sect::before,.duo .sect::before{content:'';flex:none;width:2.8mm;height:2.8mm;background:var(--accent)}
.blk>.sect::after,.duo .sect::after{content:'';flex:1;height:1px;background:var(--line)}

.facts{background:none;border:0;border-radius:0;gap:2mm;overflow:visible;margin-top:0}
.fact{background:var(--wash);border-radius:1.2mm;padding:3mm 4mm}
.fact .v{font-weight:600}
.fact.lead{background:var(--accent)}
.fact.lead .k,.fact.lead .v,.fact.lead .s{color:var(--accent-on)}

.evfig{border-radius:1.2mm}
.evcap .n{background:var(--fill);color:var(--fill-on)}
.fix{border-top:0;padding-top:0}
.fix>.sect{margin-bottom:3mm}
.fixlead{background:var(--wash);border-left:1.4mm solid var(--accent);padding:3.6mm 4.6mm;max-width:none}
.steps li .sn{background:var(--ink);color:#fff;border:0;border-radius:1mm}

.foot{border-top:1px solid var(--line)}
.foot .folio{margin-top:-1mm;padding:1.2mm 2.6mm;border-radius:.8mm;background:var(--fill);color:var(--fill-on)}

.sumband{background:var(--wash);border:0;border-radius:1.2mm;text-align:left;padding:4mm 4.4mm}
.sumband b{font-size:24pt;color:var(--ink)}
.formula{background:var(--wash);border:0;border-left:1.4mm solid var(--accent);border-radius:0;text-align:left}
.wavehd{border-bottom:2px solid var(--rule)}

.cover{background:var(--brand);color:var(--brand-on);justify-content:flex-start;padding:22mm 18mm 15mm}
.cvlogo{max-height:18mm;max-width:80mm;margin-bottom:30mm}
.cover .chip{background:var(--brand-on);color:var(--brand);border:0;margin-bottom:8mm}
.cvtitle{font-size:46pt;line-height:1;letter-spacing:-.035em;max-width:172mm;color:inherit}
.cvsub{margin-top:7mm;font-size:13pt;color:inherit;opacity:.86}
.cvstats{margin:auto -18mm 0;padding:9mm 18mm;border:0;gap:0;background:var(--accent);color:var(--accent-on)}
.cvstats>div{flex:1}
.cvstats b{font-size:30pt;color:inherit}
.cvstats span{display:block;margin-top:1.8mm;color:inherit;opacity:.88}
.cvfoot{margin-top:8mm;padding-top:0;border-top:0;color:inherit;opacity:.82}
`

/* --------------------------------------------------------------- minimal */
const MINIMAL = `
:root{--wash:#fff}
.page:not([data-kind="cover"])::before{content:'';position:absolute;left:0;right:0;top:0;height:1.4mm;background:var(--fill)}
.ttl{font-size:17pt;font-weight:600;line-height:1.2;letter-spacing:-.012em}
.fhd .hd{margin-bottom:4mm}
.tag{background:none;border:1px solid var(--ink);color:var(--ink);padding:1.7mm 2.6mm;border-radius:0}
.tag.crit{background:none;border-color:var(--crim);color:var(--crim)}
.tag.high{background:none;border-color:var(--amber);color:var(--amber)}
.tag.med{background:none;border-color:var(--line);color:var(--ink2)}

.sect{font-family:var(--body);font-size:7.4pt;font-weight:600;letter-spacing:.13em;color:var(--ink);border-bottom:0;padding-bottom:0;margin-bottom:2mm}
.shd .sect{color:var(--muted);margin-bottom:2.4mm}
.blk{margin-top:5mm;padding-top:3.4mm;border-top:1px solid var(--line)}
.blk.tight{margin-top:2mm;padding-top:0;border-top:0}
.conthd+.blk,.facts+.blk{margin-top:4mm;padding-top:0;border-top:0}

.facts{background:none;border:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);border-radius:0;gap:0 6mm;padding:1.6mm 0;margin-top:5mm}
.fact{background:none;padding:1.7mm 0;flex:1 1 36mm}
.fact.lead{background:none;flex:1 1 36mm}
.fact.lead .k{color:var(--muted);opacity:1}
.fact.lead .v{font-family:var(--body);font-weight:600;font-size:9.6pt;line-height:1.3;letter-spacing:0;color:var(--ink)}
.fact.lead .v small{font-family:var(--body);font-weight:400;font-size:8.6pt;letter-spacing:0;margin-left:1.6mm;color:var(--ink2);opacity:1}
.fact.lead .s{color:var(--ink2);opacity:1;margin-top:.4mm}

.evfig{border-radius:0}
.figimg{padding:3mm 0}
.evcap .n{background:none;color:var(--ink);border:1px solid var(--ink);border-radius:0}
.code{border:0;border-bottom:1px solid var(--line)}
.fix{border-top:1px solid var(--ink);padding-top:3.4mm}
.fixlead{font-family:var(--body);font-size:10.6pt;font-weight:600;letter-spacing:0}
.steps li{padding-left:6.4mm}
.steps li .sn{border:0;border-radius:0;width:auto;height:auto;top:0;font-size:8.4pt;font-weight:500;color:var(--ink)}
.steps li .sn::after{content:'.'}

.sumband{background:none;border:0;border-top:1px solid var(--ink);border-radius:0;text-align:left;padding:3mm 0 0}
.sumband b{font-size:18pt;color:var(--ink)}
.formula{background:none;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;padding:3.4mm 0}
.wavehd{border-bottom:1px solid var(--ink);font-size:10.5pt}

.cover{background:#fff;color:var(--ink);padding:17mm 18mm 15mm}
img.cvlogo{box-sizing:content-box;align-self:flex-start;padding:6mm 7mm;max-height:13mm;max-width:58mm;background:var(--brand)}
div.cvlogo{align-self:flex-start;width:20mm;height:20mm;background:var(--brand)}
.cover .chip{background:none;border:0;border-radius:0;padding:0;margin-bottom:4.4mm;color:var(--muted)}
.cvtitle{font-size:30pt;font-weight:600;line-height:1.1;letter-spacing:-.02em;color:var(--ink)}
.cvsub{color:var(--ink2)}
.cvslogan{color:var(--muted);opacity:1}
.cvstats{margin-top:12mm;padding:5mm 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);gap:13mm}
.cvstats b{font-size:18pt;color:var(--ink)}
.cvstats span{display:block;margin-top:1.4mm}
.cvcontact{color:var(--ink2);opacity:1}
.cvfoot{margin-top:9mm;padding-top:0;border-top:0;color:var(--muted)}
`

/* --------------------------------------------------------------- dossier */
const DOSSIER = `
.page:not([data-kind="cover"])::before{content:'';position:absolute;left:18mm;top:0;width:48mm;height:5mm;background:var(--fill)}
.pg{padding-top:19mm}
.flow{display:flow-root}
.fhd,.shd{padding-bottom:5.4mm;border-bottom:2px solid var(--ink)}
.fhd .hd{margin-bottom:4mm}
.ttl{font-size:19pt;line-height:1.15;max-width:none}
.shd .sect{border-bottom:0;padding-bottom:0;margin-bottom:2.4mm;color:var(--brand-accent)}
.shd .note{margin-top:2.4mm}
.tag{border-radius:0}

.blk>.sect,.duo .sect{color:var(--ink);font-weight:500;border-bottom:1px solid var(--ink)}

/* The rail. The facts leave the strip and stack down the left; whatever
   follows them on that page sits to their right. A continuation page has no
   rail, so what runs onto it takes the full width. */
.facts{float:left;display:block;width:48mm;margin-top:6mm;background:none;border:0;border-radius:0;overflow:visible}
.facts~*{margin-left:56mm}
.fact{background:none;padding:1.8mm 0;border-bottom:1px solid var(--line)}
.fact:last-child{border-bottom:0}
.fact .k{margin-bottom:.5mm}
.fact .v{font-size:8.8pt;line-height:1.28}
.fact.lead{background:var(--fill);padding:3.4mm 4.2mm;border-bottom:0;margin-bottom:.8mm}
.fact.lead .k,.fact.lead .v,.fact.lead .s{color:var(--fill-on)}
.fact.lead .v{font-size:20pt;line-height:1}
.fact.lead .s{margin-top:1mm}
.ev td.ck{width:38%;padding-right:4mm}
.ev td.tool{white-space:normal;width:27%;padding-left:3mm}

.evfig{border-radius:0}
.evcap .n{background:var(--ink);border-radius:0}
.fix{border-top:2px solid var(--ink)}
.steps li .sn{border-radius:0;border-color:var(--ink);color:var(--ink)}
.conthd{border-bottom:2px solid var(--ink)}
.record{clear:both}

.sumband{background:none;border:0;border-left:1.4mm solid var(--fill);border-radius:0;text-align:left;padding:1mm 0 1mm 4mm}
.sumband b{font-size:22pt;color:var(--ink)}
.formula{border-radius:0;text-align:left}
.wavehd{border-bottom:2px solid var(--ink)}

.cover{background:#fff;color:var(--ink);justify-content:center;padding:0 18mm 0 92mm}
.cover::before{content:'';position:absolute;left:0;top:0;bottom:0;width:78mm;background:var(--brand)}
.cvlogo{position:absolute;left:14mm;top:19mm;max-height:22mm;max-width:50mm;margin:0}
.cvstats{position:absolute;left:14mm;bottom:20mm;width:50mm;margin:0;padding:0;border:0;flex-direction:column;gap:7mm}
.cvstats b{font-size:25pt;color:var(--brand-on)}
.cvstats span{display:block;margin-top:1.4mm;color:var(--brand-on);opacity:.82}
.cover .chip{background:none;border:0;border-radius:0;padding:0 0 3mm;margin-bottom:7mm;color:var(--brand-accent);border-bottom:2px solid var(--ink);align-self:stretch}
.cvtitle{font-size:30pt;line-height:1.08;max-width:none;color:var(--ink)}
.cvsub{color:var(--ink2)}
.cvslogan{color:var(--muted);opacity:1}
.cvcontact{color:var(--ink2);opacity:1}
.cvfoot{position:absolute;left:92mm;right:18mm;bottom:20mm;margin:0;border-top:1px solid var(--ink);color:var(--muted)}
`

export const DESIGN_CSS: Record<PdfDesignKey, string> = {
  classic: '',
  editorial: EDITORIAL,
  bold: BOLD,
  minimal: MINIMAL,
  dossier: DOSSIER,
}
