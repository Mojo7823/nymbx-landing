import { describe, expect, it } from 'vitest'
import {
  defaultV4Selection,
  effectiveValue,
  formatV4,
  hasGroupSet,
  macroVector,
  parseV4,
  v4Metrics,
} from './metrics'

const BASE = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'

describe('v4.0 metric definitions', () => {
  it('matches the reference metrics.js order and values', () => {
    // expectedMetricOrder from FIRSTdotorg/cvss-v4-calculator metrics.js
    const expected: Record<string, string[]> = {
      AV: ['N', 'A', 'L', 'P'],
      AC: ['L', 'H'],
      AT: ['N', 'P'],
      PR: ['N', 'L', 'H'],
      UI: ['N', 'P', 'A'],
      VC: ['H', 'L', 'N'],
      VI: ['H', 'L', 'N'],
      VA: ['H', 'L', 'N'],
      SC: ['H', 'L', 'N'],
      SI: ['H', 'L', 'N'],
      SA: ['H', 'L', 'N'],
      E: ['X', 'A', 'P', 'U'],
      CR: ['X', 'H', 'M', 'L'],
      IR: ['X', 'H', 'M', 'L'],
      AR: ['X', 'H', 'M', 'L'],
      MAV: ['X', 'N', 'A', 'L', 'P'],
      MAC: ['X', 'L', 'H'],
      MAT: ['X', 'N', 'P'],
      MPR: ['X', 'N', 'L', 'H'],
      MUI: ['X', 'N', 'P', 'A'],
      MVC: ['X', 'H', 'L', 'N'],
      MVI: ['X', 'H', 'L', 'N'],
      MVA: ['X', 'H', 'L', 'N'],
      MSC: ['X', 'H', 'L', 'N'],
      MSI: ['X', 'S', 'H', 'L', 'N'],
      MSA: ['X', 'S', 'H', 'L', 'N'],
      S: ['X', 'N', 'P'],
      AU: ['X', 'N', 'Y'],
      R: ['X', 'A', 'U', 'I'],
      V: ['X', 'D', 'C'],
      RE: ['X', 'L', 'M', 'H'],
      U: ['X', 'Clear', 'Green', 'Amber', 'Red'],
    }
    expect(v4Metrics.map((m) => m.key)).toEqual(Object.keys(expected))
    for (const metric of v4Metrics) {
      expect(metric.values.map((v) => v.value)).toEqual(expected[metric.key])
    }
  })

  it('gives every value a label and a one-sentence description', () => {
    for (const metric of v4Metrics) {
      for (const value of metric.values) {
        expect(value.label).not.toBe('')
        expect(value.description.endsWith('.')).toBe(true)
      }
    }
  })
})

describe('parseV4', () => {
  it('round-trips a canonical vector', () => {
    expect(formatV4(parseV4(BASE))).toBe(BASE)
  })

  it('accepts any order, any case, and canonicalises', () => {
    const messy = 'cvss:4.0/sa:n/si:n/sc:n/va:h/vi:h/vc:h/ui:n/pr:n/at:n/ac:l/av:n'
    expect(formatV4(parseV4(messy))).toBe(BASE)
  })

  it('canonicalises the mixed-case Provider Urgency values', () => {
    expect(formatV4(parseV4(`${BASE}/U:amber`))).toBe(`${BASE}/U:Amber`)
  })

  it('keeps threat, environmental and supplemental metrics in reference order', () => {
    const vector = `${BASE}/E:A/CR:H/MSI:S/AU:Y/U:Red`
    expect(formatV4(parseV4(vector))).toBe(vector)
  })

  it('names the offending segment', () => {
    expect(() =>
      parseV4('CVSS:4.0/AV:Q/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'),
    ).toThrow(/Invalid value "Q" for metric AV in segment 2/)
    expect(() => parseV4('CVSS:4.0/AX:N/AC:L')).toThrow(/Unknown metric "AX" in segment 2/)
    expect(() => parseV4(`${BASE}/AV:L`)).toThrow(/Duplicate metric "AV" in segment 13/)
  })

  it('requires all eleven base metrics', () => {
    expect(() => parseV4('CVSS:4.0/AV:N/AC:L')).toThrow(
      /Missing required metrics AT, PR, UI, VC, VI, VA, SC, SI, SA\./,
    )
  })

  it('rejects a v3.1 vector', () => {
    expect(() => parseV4('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow(
      /must start with "CVSS:4.0"/,
    )
  })
})

describe('effectiveValue', () => {
  it('defaults E to Attacked and CR/IR/AR to High', () => {
    const selection = defaultV4Selection()
    expect(effectiveValue(selection, 'E')).toBe('A')
    expect(effectiveValue(selection, 'CR')).toBe('H')
    expect(effectiveValue(selection, 'IR')).toBe('H')
    expect(effectiveValue(selection, 'AR')).toBe('H')
  })

  it('lets a modified metric override its base metric', () => {
    const selection = parseV4(`${BASE}/MAV:P/MSI:S`)
    expect(effectiveValue(selection, 'AV')).toBe('P')
    expect(effectiveValue(selection, 'SI')).toBe('S')
    expect(effectiveValue(selection, 'MSI')).toBe('S')
  })
})

describe('macroVector', () => {
  it('is 000200 for the maximal base vector (no subsequent-system impact)', () => {
    expect(macroVector(parseV4(BASE))).toBe('000200')
  })

  it('moves EQ4 to 0 when MSI:S is set and to 1 when SC:H is set', () => {
    expect(macroVector(parseV4(`${BASE}/MSI:S`))).toBe('000000')
    expect(
      macroVector(parseV4('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:N/SA:N')),
    ).toBe('000100')
  })

  it('tracks exploit maturity in EQ5', () => {
    expect(macroVector(parseV4(`${BASE}/E:P`))).toBe('000210')
    expect(macroVector(parseV4(`${BASE}/E:U`))).toBe('000220')
  })
})

describe('hasGroupSet', () => {
  it('is false for a base-only vector', () => {
    const selection = parseV4(BASE)
    expect(hasGroupSet(selection, 'threat')).toBe(false)
    expect(hasGroupSet(selection, 'environmental')).toBe(false)
    expect(hasGroupSet(selection, 'supplemental')).toBe(false)
  })

  it('detects each optional group', () => {
    expect(hasGroupSet(parseV4(`${BASE}/E:U`), 'threat')).toBe(true)
    expect(hasGroupSet(parseV4(`${BASE}/MAV:L`), 'environmental')).toBe(true)
    expect(hasGroupSet(parseV4(`${BASE}/R:I`), 'supplemental')).toBe(true)
  })
})
