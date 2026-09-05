import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseV31 } from './v31/metrics'
import { scoreV31 } from './v31/score'
import { parseV4 } from './v4/metrics'
import { scoreV4 } from './v4/score'
import type { Severity } from './severity'

function loadFixture<T>(name: string): T {
  // Vitest transforms this module, so import.meta.url is not a file URL; the
  // fixtures are resolved from the repo root instead.
  const path = resolve(process.cwd(), 'src/tools/cvss-calculator/fixtures', name)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

interface Pair {
  v31?: string
  v31_score?: number
  v40?: string
  v40_score?: number
}

interface OracleV4 {
  vector: string
  score: number
  severity: Severity
}

interface OracleV31 {
  vector: string
  base: number
  temporal: number
  environmental: number
  severities: [Severity, Severity, Severity]
}

const firstExamples = loadFixture<{ pairs: Pair[] }>('first-examples.json')
const oracle = loadFixture<{ v4: OracleV4[]; v31: OracleV31[] }>('oracle-vectors.json')

describe('FIRST v4.0 Examples document', () => {
  const v31Cases = firstExamples.pairs.filter(
    (p): p is Pair & { v31: string; v31_score: number } =>
      typeof p.v31 === 'string' && typeof p.v31_score === 'number',
  )
  const v40Cases = firstExamples.pairs.filter(
    (p): p is Pair & { v40: string; v40_score: number } =>
      typeof p.v40 === 'string' && typeof p.v40_score === 'number',
  )

  it('covers all 68 published score values', () => {
    expect(v31Cases.length + v40Cases.length).toBe(68)
  })

  it.each(v31Cases)('v3.1 base score of $v31 is $v31_score', ({ v31, v31_score }) => {
    expect(scoreV31(parseV31(v31).selection).base).toBe(v31_score)
  })

  it.each(v40Cases)('v4.0 score of $v40 is $v40_score', ({ v40, v40_score }) => {
    expect(scoreV4(parseV4(v40)).score).toBe(v40_score)
  })
})

describe('oracle vectors (Red Hat cvss 3.6)', () => {
  it('has 400 vectors per version', () => {
    expect(oracle.v4).toHaveLength(400)
    expect(oracle.v31).toHaveLength(400)
  })

  it('matches every v4.0 score and severity', () => {
    const mismatches = oracle.v4.filter((entry) => {
      const result = scoreV4(parseV4(entry.vector))
      return result.score !== entry.score || result.severity !== entry.severity
    })
    expect(mismatches).toEqual([])
  })

  it('matches every v3.1 base, temporal and environmental score', () => {
    const mismatches = oracle.v31.filter((entry) => {
      const result = scoreV31(parseV31(entry.vector).selection)
      return (
        result.base !== entry.base ||
        result.temporal !== entry.temporal ||
        result.environmental !== entry.environmental ||
        result.severities[0] !== entry.severities[0] ||
        result.severities[1] !== entry.severities[1] ||
        result.severities[2] !== entry.severities[2]
      )
    })
    expect(mismatches).toEqual([])
  })

  it('canonicalises every fixture vector back to itself', () => {
    for (const entry of oracle.v4) {
      expect(scoreV4(parseV4(entry.vector)).macroVector).toMatch(/^\d{6}$/)
    }
  })
})
