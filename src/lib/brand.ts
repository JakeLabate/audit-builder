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
  const primary = id.colors.primary && isHex(id.colors.primary) ? id.colors.primary : '#191A3E'
  const accent = id.colors.accent && isHex(id.colors.accent) ? id.colors.accent : '#0E8C8B'
  const ink = id.colors.ink && isHex(id.colors.ink) ? id.colors.ink : shade(primary, -0.45)
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
