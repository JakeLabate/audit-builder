import type { Audit, FindingFull } from './types'

/**
 * How much of a finding reaches the document.
 *
 * The register is the record: every field, every finding, nothing left out.
 * The document is the argument: what was found, what it costs, what to do. A
 * finding page therefore does not carry the whole record, and trying to make
 * it was what pushed pages past their edges. It carries the measurements
 * behind the claim and the exhibit that shows it, and points at the register
 * for the rest.
 *
 * Every finding gets its own page.
 */

export interface DepthSpec {
  measurements: number
  exhibits: number
  extractLines: number
  steps: number
}

const STANDARD: DepthSpec = {
  measurements: 4,
  exhibits: 1,
  extractLines: 12,
  steps: 6,
}

export function depthOf(_audit: Audit | null): DepthSpec {
  return STANDARD
}

/**
 * What the client is allowed to see. `exposure` exists precisely so a finding
 * can stay in the register without reaching the client, and both exports were
 * ignoring it, which made the flag a lie.
 */
export function clientFindings(all: FindingFull[]): FindingFull[] {
  return all.filter((f) => (f as unknown as { exposure?: string }).exposure !== 'internal')
}
