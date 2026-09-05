/**
 * CVSS v3.1 equations, implemented from the specification (§7). All arithmetic
 * is done at full precision; only the display layer rounds.
 */

import { severityOf, type Severity } from '../severity'
import { NOT_DEFINED, type V31Key, type V31Selection } from './metrics'

/**
 * The specification's Roundup: round up to one decimal, using an integer
 * intermediate so binary floating-point noise cannot push a value over a
 * boundary (spec §Appendix A).
 */
export function roundup(input: number): number {
  const intInput = Math.round(input * 100000)
  if (intInput % 10000 === 0) return intInput / 100000
  return (Math.floor(intInput / 10000) + 1) / 10
}

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }
const AC: Record<string, number> = { L: 0.77, H: 0.44 }
const PR_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 }
const PR_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 }
const UI: Record<string, number> = { N: 0.85, R: 0.62 }
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 }
const E: Record<string, number> = { X: 1, H: 1, F: 0.97, P: 0.94, U: 0.91 }
const RL: Record<string, number> = { X: 1, U: 1, W: 0.97, T: 0.96, O: 0.95 }
const RC: Record<string, number> = { X: 1, C: 1, R: 0.96, U: 0.92 }
const REQ: Record<string, number> = { X: 1, H: 1.5, M: 1, L: 0.5 }

export interface V31Scores {
  base: number
  temporal: number
  environmental: number
  impact: number
  exploitability: number
  modifiedImpact: number
  modifiedExploitability: number
  severities: [Severity, Severity, Severity]
}

/** Resolve a modified metric to its effective value, falling back to the base metric. */
function effective(selection: V31Selection, modifiedKey: V31Key, baseKey: V31Key): string {
  const value = selection[modifiedKey]
  return value === NOT_DEFINED ? selection[baseKey] : value
}

export function scoreV31(selection: V31Selection): V31Scores {
  const scopeChanged = selection.S === 'C'

  // --- Base ---
  const iss = 1 - (1 - CIA[selection.C]) * (1 - CIA[selection.I]) * (1 - CIA[selection.A])
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss
  const exploitability =
    8.22 *
    AV[selection.AV] *
    AC[selection.AC] *
    (scopeChanged ? PR_CHANGED : PR_UNCHANGED)[selection.PR] *
    UI[selection.UI]

  const base =
    impact <= 0
      ? 0
      : scopeChanged
        ? roundup(Math.min(1.08 * (impact + exploitability), 10))
        : roundup(Math.min(impact + exploitability, 10))

  // --- Temporal ---
  const temporalFactor = E[selection.E] * RL[selection.RL] * RC[selection.RC]
  const temporal = roundup(base * temporalFactor)

  // --- Environmental ---
  const mc = effective(selection, 'MC', 'C')
  const mi = effective(selection, 'MI', 'I')
  const ma = effective(selection, 'MA', 'A')
  const ms = effective(selection, 'MS', 'S')
  const modifiedScopeChanged = ms === 'C'

  const miss = Math.min(
    1 -
      (1 - CIA[mc] * REQ[selection.CR]) *
        (1 - CIA[mi] * REQ[selection.IR]) *
        (1 - CIA[ma] * REQ[selection.AR]),
    0.915,
  )
  const modifiedImpact = modifiedScopeChanged
    ? 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss * 0.9731 - 0.02, 13)
    : 6.42 * miss

  // MPR's weight depends on the *modified* scope.
  const modifiedExploitability =
    8.22 *
    AV[effective(selection, 'MAV', 'AV')] *
    AC[effective(selection, 'MAC', 'AC')] *
    (modifiedScopeChanged ? PR_CHANGED : PR_UNCHANGED)[effective(selection, 'MPR', 'PR')] *
    UI[effective(selection, 'MUI', 'UI')]

  const environmental =
    modifiedImpact <= 0
      ? 0
      : modifiedScopeChanged
        ? roundup(
            roundup(Math.min(1.08 * (modifiedImpact + modifiedExploitability), 10)) *
              temporalFactor,
          )
        : roundup(roundup(Math.min(modifiedImpact + modifiedExploitability, 10)) * temporalFactor)

  return {
    base,
    temporal,
    environmental,
    impact,
    exploitability,
    modifiedImpact,
    modifiedExploitability,
    severities: [severityOf(base), severityOf(temporal), severityOf(environmental)],
  }
}
