import type { FindingFull } from './types'

/**
 * What the client is allowed to see. `exposure` exists precisely so a finding
 * can stay in the register without reaching the client, and both exports were
 * ignoring it, which made the flag a lie.
 */
export function clientFindings(all: FindingFull[]): FindingFull[] {
  return all.filter((f) => (f as unknown as { exposure?: string }).exposure !== 'internal')
}
