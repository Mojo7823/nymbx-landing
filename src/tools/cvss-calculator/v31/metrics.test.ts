import { describe, expect, it } from 'vitest'
import { CvssParseError } from '../vector'
import {
  defaultV31Selection,
  formatV31,
  hasEnvironmental,
  hasTemporal,
  parseV31,
  v31Metrics,
} from './metrics'

const BASE = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'

describe('v3.1 metric definitions', () => {
  it('lists the 22 metrics in specification order', () => {
    expect(v31Metrics.map((m) => m.key)).toEqual([
      'AV',
      'AC',
      'PR',
      'UI',
      'S',
      'C',
      'I',
      'A',
      'E',
      'RL',
      'RC',
      'CR',
      'IR',
      'AR',
      'MAV',
      'MAC',
      'MPR',
      'MUI',
      'MS',
      'MC',
      'MI',
      'MA',
    ])
  })

  it('offers "Not Defined" first for every optional metric', () => {
    for (const metric of v31Metrics) {
      if (metric.group === 'base') expect(metric.values[0].value).not.toBe('X')
      else expect(metric.values[0].value).toBe('X')
    }
  })

  it('gives every value a label and a one-sentence description', () => {
    for (const metric of v31Metrics) {
      for (const value of metric.values) {
        expect(value.label).not.toBe('')
        expect(value.description.endsWith('.')).toBe(true)
      }
    }
  })
})

describe('parseV31', () => {
  it('round-trips a canonical vector', () => {
    expect(formatV31(parseV31(BASE).selection)).toBe(BASE)
  })

  it('accepts metrics in any order and re-orders them', () => {
    const shuffled = 'CVSS:3.1/A:H/S:U/C:H/I:H/UI:N/PR:N/AC:L/AV:N'
    expect(formatV31(parseV31(shuffled).selection)).toBe(BASE)
  })

  it('accepts lowercase input and canonicalises it', () => {
    expect(formatV31(parseV31(BASE.toLowerCase()).selection)).toBe(BASE)
  })

  it('accepts the CVSS:3.0 prefix and flags it', () => {
    const result = parseV31(BASE.replace('3.1', '3.0'))
    expect(result.wasV30).toBe(true)
    expect(formatV31(result.selection)).toBe(BASE)
  })

  it('omits "not defined" metrics from the canonical form', () => {
    expect(formatV31(parseV31(`${BASE}/E:X/MAV:X`).selection)).toBe(BASE)
  })

  it('names the segment of an unknown metric', () => {
    expect(() => parseV31('CVSS:3.1/AV:N/AX:N/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow(
      /Unknown metric "AX" in segment 3/,
    )
  })

  it('names the segment and the allowed values of an invalid value', () => {
    expect(() => parseV31('CVSS:3.1/AV:Q/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow(
      /Invalid value "Q" for metric AV in segment 2 — expected N, A, L or P\./,
    )
  })

  it('rejects duplicates', () => {
    expect(() => parseV31(`${BASE}/AV:L`)).toThrow(/Duplicate metric "AV" in segment 10/)
  })

  it('rejects a missing base metric', () => {
    expect(() => parseV31('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H')).toThrow(
      /Missing required metric A\./,
    )
  })

  it('rejects a wrong or missing prefix', () => {
    expect(() => parseV31('AV:N/AC:L')).toThrow(/Segment 1 is "AV:N"/)
    expect(() => parseV31('CVSS:2.0/AV:N')).toThrow(CvssParseError)
  })

  it('rejects a malformed segment', () => {
    expect(() => parseV31('CVSS:3.1/AV:N/garbage/PR:N')).toThrow(
      /Segment 3 is "garbage" — expected a "Metric:Value" pair\./,
    )
  })

  it('rejects an empty string', () => {
    expect(() => parseV31('   ')).toThrow(/Enter a CVSS vector string\./)
  })
})

describe('group helpers', () => {
  it('reports the default selection as base-only', () => {
    const selection = defaultV31Selection()
    expect(hasTemporal(selection)).toBe(false)
    expect(hasEnvironmental(selection)).toBe(false)
  })

  it('detects temporal and environmental metrics', () => {
    expect(hasTemporal(parseV31(`${BASE}/E:F`).selection)).toBe(true)
    expect(hasEnvironmental(parseV31(`${BASE}/MAV:L`).selection)).toBe(true)
    expect(hasEnvironmental(parseV31(`${BASE}/CR:H`).selection)).toBe(true)
  })
})
