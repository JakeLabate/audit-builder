import type { Audit, FindingFull } from './types'

/**
 * How much of a finding reaches the document.
 *
 * The sheet is the record: every field, every finding, nothing left out. The
 * document is the argument: what was found, what it costs, what to do. A
 * finding page therefore does not need to carry the whole record, and trying
 * to make it was what pushed pages past their edges. It carries as much as the
 * reader of that particular document needs, and points at the sheet for the
 * rest.
 *
 * Every finding still gets its own page at every depth. What changes is how
 * much evidence that page shows.
 */

export type Depth = 'walkthrough' | 'standard' | 'reference'

export interface DepthSpec {
  key: Depth
  name: string
  who: string
  measurements: number
  exhibits: number
  extractLines: number
  steps: number
}

export const DEPTHS: DepthSpec[] = [
  {
    key: 'walkthrough', name: 'Walkthrough',
    who: 'For presenting live. The claim, what it costs and what to do, with the evidence left in the sheet.',
    measurements: 0, exhibits: 0, extractLines: 0, steps: 5,
  },
  {
    key: 'standard', name: 'Standard',
    who: 'For sending over. Adds the measurements behind the claim and the exhibit that shows it.',
    measurements: 4, exhibits: 1, extractLines: 12, steps: 6,
  },
  {
    key: 'reference', name: 'Reference',
    who: 'For the team who will work from it. Every measurement and up to three exhibits per finding.',
    measurements: 8, exhibits: 3, extractLines: 20, steps: 10,
  },
]

export function depthOf(audit: Audit | null): DepthSpec {
  const k = (audit as unknown as { depth?: Depth })?.depth
  return DEPTHS.find((d) => d.key === k) ?? DEPTHS[1]
}

/**
 * What the client is allowed to see. `exposure` exists precisely so a finding
 * can stay in the register without reaching the client, and the document was
 * ignoring it, which made the flag a lie.
 */
export function clientFindings(all: FindingFull[]): FindingFull[] {
  return all.filter((f) => (f as unknown as { exposure?: string }).exposure !== 'internal')
}
