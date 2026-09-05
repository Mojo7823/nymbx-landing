/**
 * CVSS v4.0 scoring — a faithful TypeScript port of `cvss_score()` from
 * FIRSTdotorg/cvss-v4-calculator (see SOURCES.md). The structure, the level
 * tables, the EQ3/EQ6 joint handling, the `step = 0.1` normalisation and the
 * final rounding are kept exactly as in the reference; only the syntax changed.
 */

import { severityOf, type Severity } from '../severity'
import { cvssLookup, maxComposed, maxSeverity } from './firstData'
import { effectiveValue, hasGroupSet, macroVector, type V4Selection } from './metrics'

type Levels = Record<string, number>

const AV_levels: Levels = { N: 0.0, A: 0.1, L: 0.2, P: 0.3 }
const PR_levels: Levels = { N: 0.0, L: 0.1, H: 0.2 }
const UI_levels: Levels = { N: 0.0, P: 0.1, A: 0.2 }

const AC_levels: Levels = { L: 0.0, H: 0.1 }
const AT_levels: Levels = { N: 0.0, P: 0.1 }

const VC_levels: Levels = { H: 0.0, L: 0.1, N: 0.2 }
const VI_levels: Levels = { H: 0.0, L: 0.1, N: 0.2 }
const VA_levels: Levels = { H: 0.0, L: 0.1, N: 0.2 }

const SC_levels: Levels = { H: 0.1, L: 0.2, N: 0.3 }
const SI_levels: Levels = { S: 0.0, H: 0.1, L: 0.2, N: 0.3 }
const SA_levels: Levels = { S: 0.0, H: 0.1, L: 0.2, N: 0.3 }

const CR_levels: Levels = { H: 0.0, M: 0.1, L: 0.2 }
const IR_levels: Levels = { H: 0.0, M: 0.1, L: 0.2 }
const AR_levels: Levels = { H: 0.0, M: 0.1, L: 0.2 }

/** `CVSS-B`, `CVSS-BT`, `CVSS-BE` or `CVSS-BTE` (specification §1.3). */
export type Nomenclature = 'CVSS-B' | 'CVSS-BT' | 'CVSS-BE' | 'CVSS-BTE'

export interface V4Scores {
  score: number
  severity: Severity
  macroVector: string
  nomenclature: Nomenclature
}

/** Port of `extractValueMetric()` — read one metric out of a "max" vector. */
function extractValueMetric(metric: string, str: string): string {
  const extracted = str.slice(str.indexOf(metric) + metric.length + 1)
  const slash = extracted.indexOf('/')
  return slash > 0 ? extracted.substring(0, slash) : extracted
}

export function nomenclatureOf(selection: V4Selection): Nomenclature {
  const threat = hasGroupSet(selection, 'threat')
  const environmental = hasGroupSet(selection, 'environmental')
  if (threat && environmental) return 'CVSS-BTE'
  if (threat) return 'CVSS-BT'
  if (environmental) return 'CVSS-BE'
  return 'CVSS-B'
}

export function scoreV4(selection: V4Selection): V4Scores {
  const macro = macroVector(selection)
  const score = computeScore(selection, macro)
  return {
    score,
    severity: severityOf(score),
    macroVector: macro,
    nomenclature: nomenclatureOf(selection),
  }
}

function computeScore(selection: V4Selection, macroVectorResult: string): number {
  const m = (metric: string) => effectiveValue(selection, metric)

  // Exception for no impact on system (shortcut)
  if (['VC', 'VI', 'VA', 'SC', 'SI', 'SA'].every((metric) => m(metric) === 'N')) {
    return 0.0
  }

  let value = cvssLookup[macroVectorResult]

  // 1.a. maximal scoring difference: current MacroVector vs. the next lower one.
  const eq1 = parseInt(macroVectorResult[0], 10)
  const eq2 = parseInt(macroVectorResult[1], 10)
  const eq3 = parseInt(macroVectorResult[2], 10)
  const eq4 = parseInt(macroVectorResult[3], 10)
  const eq5 = parseInt(macroVectorResult[4], 10)
  const eq6 = parseInt(macroVectorResult[5], 10)

  const eq1NextLowerMacro = `${eq1 + 1}${eq2}${eq3}${eq4}${eq5}${eq6}`
  const eq2NextLowerMacro = `${eq1}${eq2 + 1}${eq3}${eq4}${eq5}${eq6}`

  // eq3 and eq6 are related
  let eq3eq6NextLowerMacro = ''
  let eq3eq6NextLowerMacroLeft = ''
  let eq3eq6NextLowerMacroRight = ''
  if (eq3 === 1 && eq6 === 1) {
    eq3eq6NextLowerMacro = `${eq1}${eq2}${eq3 + 1}${eq4}${eq5}${eq6}`
  } else if (eq3 === 0 && eq6 === 1) {
    eq3eq6NextLowerMacro = `${eq1}${eq2}${eq3 + 1}${eq4}${eq5}${eq6}`
  } else if (eq3 === 1 && eq6 === 0) {
    eq3eq6NextLowerMacro = `${eq1}${eq2}${eq3}${eq4}${eq5}${eq6 + 1}`
  } else if (eq3 === 0 && eq6 === 0) {
    eq3eq6NextLowerMacroLeft = `${eq1}${eq2}${eq3}${eq4}${eq5}${eq6 + 1}`
    eq3eq6NextLowerMacroRight = `${eq1}${eq2}${eq3 + 1}${eq4}${eq5}${eq6}`
  } else {
    // 21 --> 32 (does not exist)
    eq3eq6NextLowerMacro = `${eq1}${eq2}${eq3 + 1}${eq4}${eq5}${eq6 + 1}`
  }

  const eq4NextLowerMacro = `${eq1}${eq2}${eq3}${eq4 + 1}${eq5}${eq6}`
  const eq5NextLowerMacro = `${eq1}${eq2}${eq3}${eq4}${eq5 + 1}${eq6}`

  // Missing macro vectors have no score; NaN then drops out of the mean below.
  const lookup = (key: string): number => (key in cvssLookup ? cvssLookup[key] : NaN)

  const scoreEq1NextLowerMacro = lookup(eq1NextLowerMacro)
  const scoreEq2NextLowerMacro = lookup(eq2NextLowerMacro)

  let scoreEq3eq6NextLowerMacro: number
  if (eq3 === 0 && eq6 === 0) {
    // multiple paths — take the one with the higher score
    const left = lookup(eq3eq6NextLowerMacroLeft)
    const right = lookup(eq3eq6NextLowerMacroRight)
    scoreEq3eq6NextLowerMacro = left > right ? left : right
  } else {
    scoreEq3eq6NextLowerMacro = lookup(eq3eq6NextLowerMacro)
  }

  const scoreEq4NextLowerMacro = lookup(eq4NextLowerMacro)
  const scoreEq5NextLowerMacro = lookup(eq5NextLowerMacro)

  // 1.b. severity distance from a highest-severity vector of the same MacroVector.
  const eq1Maxes = maxComposed.eq1[eq1]
  const eq2Maxes = maxComposed.eq2[eq2]
  const eq3Eq6Maxes = maxComposed.eq3[eq3][eq6]
  const eq4Maxes = maxComposed.eq4[eq4]
  const eq5Maxes = maxComposed.eq5[eq5]

  const maxVectors: string[] = []
  for (const eq1Max of eq1Maxes) {
    for (const eq2Max of eq2Maxes) {
      for (const eq3Eq6Max of eq3Eq6Maxes) {
        for (const eq4Max of eq4Maxes) {
          for (const eq5Max of eq5Maxes) {
            maxVectors.push(eq1Max + eq2Max + eq3Eq6Max + eq4Max + eq5Max)
          }
        }
      }
    }
  }

  // Find the first max vector whose severity distances are all non-negative.
  // As in the reference, if none qualifies the last iteration's values are used.
  let severityDistanceAV = 0
  let severityDistancePR = 0
  let severityDistanceUI = 0
  let severityDistanceAC = 0
  let severityDistanceAT = 0
  let severityDistanceVC = 0
  let severityDistanceVI = 0
  let severityDistanceVA = 0
  let severityDistanceSC = 0
  let severityDistanceSI = 0
  let severityDistanceSA = 0
  let severityDistanceCR = 0
  let severityDistanceIR = 0
  let severityDistanceAR = 0

  for (const maxVector of maxVectors) {
    severityDistanceAV = AV_levels[m('AV')] - AV_levels[extractValueMetric('AV', maxVector)]
    severityDistancePR = PR_levels[m('PR')] - PR_levels[extractValueMetric('PR', maxVector)]
    severityDistanceUI = UI_levels[m('UI')] - UI_levels[extractValueMetric('UI', maxVector)]

    severityDistanceAC = AC_levels[m('AC')] - AC_levels[extractValueMetric('AC', maxVector)]
    severityDistanceAT = AT_levels[m('AT')] - AT_levels[extractValueMetric('AT', maxVector)]

    severityDistanceVC = VC_levels[m('VC')] - VC_levels[extractValueMetric('VC', maxVector)]
    severityDistanceVI = VI_levels[m('VI')] - VI_levels[extractValueMetric('VI', maxVector)]
    severityDistanceVA = VA_levels[m('VA')] - VA_levels[extractValueMetric('VA', maxVector)]

    severityDistanceSC = SC_levels[m('SC')] - SC_levels[extractValueMetric('SC', maxVector)]
    severityDistanceSI = SI_levels[m('SI')] - SI_levels[extractValueMetric('SI', maxVector)]
    severityDistanceSA = SA_levels[m('SA')] - SA_levels[extractValueMetric('SA', maxVector)]

    severityDistanceCR = CR_levels[m('CR')] - CR_levels[extractValueMetric('CR', maxVector)]
    severityDistanceIR = IR_levels[m('IR')] - IR_levels[extractValueMetric('IR', maxVector)]
    severityDistanceAR = AR_levels[m('AR')] - AR_levels[extractValueMetric('AR', maxVector)]

    const anyNegative = [
      severityDistanceAV,
      severityDistancePR,
      severityDistanceUI,
      severityDistanceAC,
      severityDistanceAT,
      severityDistanceVC,
      severityDistanceVI,
      severityDistanceVA,
      severityDistanceSC,
      severityDistanceSI,
      severityDistanceSA,
      severityDistanceCR,
      severityDistanceIR,
      severityDistanceAR,
    ].some((met) => met < 0)
    if (anyNegative) continue
    // if multiple maxes exist to reach it, the first one is enough
    break
  }

  const currentSeverityDistanceEq1 = severityDistanceAV + severityDistancePR + severityDistanceUI
  const currentSeverityDistanceEq2 = severityDistanceAC + severityDistanceAT
  const currentSeverityDistanceEq3eq6 =
    severityDistanceVC +
    severityDistanceVI +
    severityDistanceVA +
    severityDistanceCR +
    severityDistanceIR +
    severityDistanceAR
  const currentSeverityDistanceEq4 = severityDistanceSC + severityDistanceSI + severityDistanceSA

  const step = 0.1

  const availableDistanceEq1 = value - scoreEq1NextLowerMacro
  const availableDistanceEq2 = value - scoreEq2NextLowerMacro
  const availableDistanceEq3eq6 = value - scoreEq3eq6NextLowerMacro
  const availableDistanceEq4 = value - scoreEq4NextLowerMacro
  const availableDistanceEq5 = value - scoreEq5NextLowerMacro

  let nExistingLower = 0

  let normalizedSeverityEq1 = 0
  let normalizedSeverityEq2 = 0
  let normalizedSeverityEq3eq6 = 0
  let normalizedSeverityEq4 = 0
  let normalizedSeverityEq5 = 0

  // multiply by step because the distance is pure
  const maxSeverityEq1 = maxSeverity.eq1[eq1] * step
  const maxSeverityEq2 = maxSeverity.eq2[eq2] * step
  const maxSeverityEq3eq6 = maxSeverity.eq3eq6[eq3][eq6] * step
  const maxSeverityEq4 = maxSeverity.eq4[eq4] * step

  if (!isNaN(availableDistanceEq1)) {
    nExistingLower += 1
    normalizedSeverityEq1 = availableDistanceEq1 * (currentSeverityDistanceEq1 / maxSeverityEq1)
  }
  if (!isNaN(availableDistanceEq2)) {
    nExistingLower += 1
    normalizedSeverityEq2 = availableDistanceEq2 * (currentSeverityDistanceEq2 / maxSeverityEq2)
  }
  if (!isNaN(availableDistanceEq3eq6)) {
    nExistingLower += 1
    normalizedSeverityEq3eq6 =
      availableDistanceEq3eq6 * (currentSeverityDistanceEq3eq6 / maxSeverityEq3eq6)
  }
  if (!isNaN(availableDistanceEq4)) {
    nExistingLower += 1
    normalizedSeverityEq4 = availableDistanceEq4 * (currentSeverityDistanceEq4 / maxSeverityEq4)
  }
  if (!isNaN(availableDistanceEq5)) {
    // for eq5 the percentage is always 0
    nExistingLower += 1
    normalizedSeverityEq5 = availableDistanceEq5 * 0
  }

  // 2. mean of the proportional distances
  const meanDistance =
    nExistingLower === 0
      ? 0
      : (normalizedSeverityEq1 +
          normalizedSeverityEq2 +
          normalizedSeverityEq3eq6 +
          normalizedSeverityEq4 +
          normalizedSeverityEq5) /
        nExistingLower

  // 3. macro-vector score minus the mean distance, rounded to one decimal
  value -= meanDistance
  if (value < 0) value = 0.0
  if (value > 10) value = 10.0
  return roundToOneDecimal(value)
}

/**
 * The reference ends with `Math.round(value * 10) / 10`. Taken literally that
 * mis-rounds the handful of vectors whose exact result is a half-decimal: the
 * accumulated binary error makes 4.95 arrive as 4.9499999999999993, which
 * rounds down to 4.9 where FIRST's published tables and every decimal-based
 * implementation say 5.0. Snapping to six decimals through an integer
 * intermediate first (the same guard the v3.1 Roundup uses) removes the noise
 * without changing any vector the reference already gets right.
 */
function roundToOneDecimal(value: number): number {
  const snapped = Math.round(value * 1000000)
  return Math.round(snapped / 100000) / 10
}
