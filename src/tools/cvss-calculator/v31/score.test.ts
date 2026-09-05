import { describe, expect, it } from 'vitest'
import { parseV31 } from './metrics'
import { roundup, scoreV31 } from './score'

function scores(vector: string) {
  return scoreV31(parseV31(vector).selection)
}

describe('roundup', () => {
  it('leaves exact one-decimal values alone', () => {
    expect(roundup(4.0)).toBe(4.0)
    expect(roundup(0)).toBe(0)
    expect(roundup(10)).toBe(10)
  })

  it('rounds anything above a tenth up to the next tenth', () => {
    expect(roundup(4.02)).toBe(4.1)
    expect(roundup(4.001)).toBe(4.1)
  })

  it('ignores binary floating-point noise', () => {
    expect(roundup(4.000000001)).toBe(4.0)
    expect(roundup(0.1 + 0.2)).toBe(0.3)
  })
})

describe('scoreV31 base', () => {
  it('scores the worst unchanged-scope vector at 9.8', () => {
    expect(scores('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').base).toBe(9.8)
  })

  it('scores the worst changed-scope vector at 10.0', () => {
    expect(scores('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H').base).toBe(10.0)
  })

  it('scores a no-impact vector at 0', () => {
    const result = scores('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')
    expect(result.base).toBe(0)
    expect(result.severities[0]).toBe('None')
  })

  it('uses the changed-scope Privileges Required weights', () => {
    // PR:L is 0.62 unchanged but 0.68 changed.
    expect(scores('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H').base).toBe(8.8)
    expect(scores('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H').base).toBe(9.9)
  })
})

describe('scoreV31 temporal and environmental', () => {
  it('applies the temporal multipliers', () => {
    const result = scores('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:R')
    expect(result.base).toBe(9.8)
    expect(result.temporal).toBe(8.5)
  })

  it('raises the environmental score with High requirements', () => {
    const result = scores('CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L/CR:H/IR:H/AR:H')
    expect(result.base).toBe(4.7)
    expect(result.environmental).toBe(5.8)
  })

  it('applies modified metrics, including MPR under a modified scope', () => {
    const result = scores('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H/MS:C/MPR:L')
    expect(result.base).toBe(8.8)
    expect(result.environmental).toBe(10.0)
  })

  it('reproduces the Scope-Changed environmental subtlety with no environmental metrics set', () => {
    // The environmental formula uses (MISS * 0.9731 - 0.02)^13 where the base
    // formula uses (ISS - 0.02)^15, so the two can differ by 0.1.
    const result = scores('CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:H')
    expect(result.base).toBe(7.1)
    expect(result.environmental).toBe(7.0)
  })

  it('exposes the sub-scores at full precision', () => {
    const result = scores('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')
    expect(result.impact).toBeCloseTo(5.873118, 5)
    expect(result.exploitability).toBeCloseTo(3.887043, 5)
  })
})
