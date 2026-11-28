import type { Brand } from './types'

/**
 * The brand kit, and the small amount of arithmetic that keeps a report
 * readable whatever colour the client picked.
 *
 * Everything reads through `identityOf`, which falls back to the two legacy
 * columns, so a brand created before the kit existed still renders.
 */

export interface BrandIdentity {
  legal_name: string | null
  slogan: string | null
  industry: string | null
  logo_path: string | null
  logo_dark_path: string | null
  mark_path: string | null
  colors: { primary: string | null; accent: string | null; ink: string | null }
  type: { display: string; body: string }
  voice: string | null
  contact: { name: string | null; role: string | null; email: string | null }
}

/** Fonts the print window can actually load. A brand cannot name an arbitrary
 *  face, because the report would silently fall back and look wrong. */
export const DISPLAY_FONTS = [
  'Space Grotesk', 'Fraunces', 'DM Serif Display', 'Archivo', 'Bricolage Grotesque',
] as const
export const BODY_FONTS = [
  'IBM Plex Sans', 'Source Sans 3', 'Inter', 'Lora', 'Work Sans',
] as const

export const DEFAULTS: BrandIdentity = {
  legal_name: null, slogan: null, industry: null,
  logo_path: null, logo_dark_path: null, mark_path: null,
  colors: { primary: null, accent: null, ink: null },
  type: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
  voice: null,
  contact: { name: null, role: null, email: null },
}

export function identityOf(brand: Brand | null): BrandIdentity {
  const i = (brand?.identity ?? {}) as Partial<BrandIdentity>
  return {
    ...DEFAULTS,
    ...i,
    colors: {
      primary: i.colors?.primary ?? brand?.primary_color ?? null,
      accent: i.colors?.accent ?? null,
      ink: i.colors?.ink ?? null,
    },
    type: {
      display: i.type?.display ?? DEFAULTS.type.display,
      body: i.type?.body ?? DEFAULTS.type.body,
    },
    contact: { ...DEFAULTS.contact, ...(i.contact ?? {}) },
    logo_path: i.logo_path ?? brand?.logo_path ?? null,
  }
}

/* ------------------------------------------------------------- colour ---- */

const clean = (hex: string) => hex.replace('#', '').trim()

export function isHex(v: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

function rgb(hex: string): [number, number, number] {
  let h = clean(hex)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/**
 * A kit colour in the one form everything downstream can read: a hash and six
 * digits. The kit accepts abc and abc123 as well as #ABC123, and a colour
 * without its hash is not a colour to a stylesheet, or to the Sheets exporter,
 * which reads the digits by position.
 */
export function hex6(v: string): string {
  let h = clean(v)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return '#' + h.toUpperCase()
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}

/**
 * What to print on top of a brand colour. A pale brand colour with white text
 * is the most common way a branded report ends up unreadable, so the decision
 * is made from the contrast rather than assumed.
 */
export function onColor(hex: string): '#FFFFFF' | '#12140F' {
  return contrast(hex, '#FFFFFF') >= contrast(hex, '#12140F') ? '#FFFFFF' : '#12140F'
}

/** Darken or lighten for rules and washes, so one brand colour yields a set. */
export function shade(hex: string, amount: number): string {
  const out = rgb(hex).map((v) => {
    const n = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount
    return Math.max(0, Math.min(255, Math.round(n)))
  })
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** The palette a report is built from, derived from whatever the brand set. */
export function reportPalette(id: BrandIdentity) {
  const primary = id.colors.primary && isHex(id.colors.primary) ? hex6(id.colors.primary) : '#191A3E'
  const accent = id.colors.accent && isHex(id.colors.accent) ? hex6(id.colors.accent) : '#0E8C8B'
  const ink = id.colors.ink && isHex(id.colors.ink) ? hex6(id.colors.ink) : shade(primary, -0.45)
  return {
    primary,
    accent,
    ink,
    onPrimary: onColor(primary),
    onAccent: onColor(accent),
    wash: shade(primary, 0.92),
    rule: shade(primary, 0.78),
    coverContrast: contrast(primary, onColor(primary)),
  }
}

/**
 * Everything a design other than Classic draws with, worked out from the kit.
 *
 * Classic sets its text in the app's own indigo and keeps the brand for the
 * cover and the accents. The other designs are tinted throughout, so they need
 * a full set of neutrals that belong to the brand, and each one is held to the
 * contrast it needs for the job it does. A brand that picked a pale colour
 * still gets body text that reads, rules that show on white paper, and a band
 * whose lettering can be seen.
 */
export function designPalette(id: BrandIdentity) {
  const pal = reportPalette(id)
  const toward = (hex: string, floor: number, step = -0.1) => {
    let c = hex
    for (let i = 0; i < 16 && contrast(c, '#FFFFFF') < floor; i++) c = shade(c, step)
    return c
  }
  // Body text. The kit's ink is a suggestion; 12 to 1 is what a page of 10pt
  // prose needs, and a derived ink from a light primary does not reach it.
  const ink = toward(pal.ink, 12)
  const muted = toward(shade(ink, 0.5), 4.6, -0.06)
  // A band of the brand colour on white paper. A primary too pale to be seen
  // against the page gives way to the ink.
  const fill = contrast(pal.primary, '#FFFFFF') >= 1.25 ? pal.primary : ink
  // A thin rule needs more than a fill does: a hairline of yellow is invisible.
  const rule = contrast(pal.primary, '#FFFFFF') >= 3 ? pal.primary : ink
  // Small accent type on white, darkened until it can be read.
  const accentText = toward(pal.accent, 4.5, -0.12)
  const accentFill = contrast(pal.accent, '#FFFFFF') >= 1.25 ? pal.accent : accentText
  return {
    ...pal,
    ink,
    ink2: shade(ink, 0.14),
    muted,
    line: shade(ink, 0.84),
    wash: shade(ink, 0.95),
    fill,
    onFill: onColor(fill),
    rule,
    accentText,
    accentFill,
    onAccentFill: onColor(accentFill),
  }
}

/** The Google Fonts request for whatever this brand chose. */
export function fontHref(id: BrandIdentity): string {
  const fam = (n: string) => n.replace(/ /g, '+')
  return (
    'https://fonts.googleapis.com/css2' +
    `?family=${fam(id.type.display)}:wght@500;600;700` +
    `&family=${fam(id.type.body)}:wght@400;500;600` +
    '&family=IBM+Plex+Mono:wght@400;500&display=swap'
  )
}
