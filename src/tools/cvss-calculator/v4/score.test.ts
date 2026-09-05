import { describe, expect, it } from 'vitest'
import { parseV4 } from './metrics'
import { nomenclatureOf, scoreV4 } from './score'

const BASE = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'

function score(vector: string) {
  return scoreV4(parseV4(vector))
}

describe('scoreV4', () => {
  it('scores the maximal base vector at 9.3 Critical', () => {
    const result = score(BASE)
    expect(result.score).toBe(9.3)
    expect(result.severity).toBe('Critical')
    expect(result.macroVector).toBe('000200')
    expect(result.nomenclature).toBe('CVSS-B')
  })

  it('scores a vector with no impact at all at 0.0', () => {
    const result = score('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N')
    expect(result.score).toBe(0)
    expect(result.severity).toBe('None')
  })

  it('lowers the score for unreported exploit maturity', () => {
    const result = score(`${BASE}/E:U`)
    expect(result.score).toBe(8.1)
    expect(result.nomenclature).toBe('CVSS-BT')
  })

  it('scores a CVSS-BE vector', () => {
    const result = score(`${BASE}/CR:L/IR:L/AR:L`)
    expect(result.score).toBe(8.9)
    expect(result.nomenclature).toBe('CVSS-BE')
  })

  it('scores a CVSS-BTE vector', () => {
    const result = score(`${BASE}/E:P/CR:L/IR:L/AR:L`)
    expect(result.score).toBe(7.9)
    expect(result.nomenclature).toBe('CVSS-BTE')
  })

  it('raises EQ4 through the Safety value of MSI', () => {
    const withSafety = score(
      'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:L/SI:L/SA:L/MSI:S',
    )
    expect(withSafety.macroVector[3]).toBe('0')
    expect(withSafety.score).toBe(10)
  })

  it('ignores supplemental metrics when scoring', () => {
    expect(score(`${BASE}/S:P/AU:Y/R:I/V:C/RE:H/U:Red`).score).toBe(score(BASE).score)
  })

  it('rounds half-decimals up, as FIRST publishes them', () => {
    // Exactly 4.95 and 5.65 before rounding; naive float rounding gives 4.9/5.6.
    expect(score('CVSS:4.0/AV:L/AC:H/AT:P/PR:N/UI:A/VC:L/VI:N/VA:L/SC:H/SI:H/SA:H').score).toBe(5.0)
    expect(score('CVSS:4.0/AV:L/AC:H/AT:P/PR:N/UI:A/VC:N/VI:H/VA:L/SC:L/SI:N/SA:N').score).toBe(5.7)
  })
})

describe('nomenclatureOf', () => {
  it('names each combination of optional groups', () => {
    expect(nomenclatureOf(parseV4(BASE))).toBe('CVSS-B')
    expect(nomenclatureOf(parseV4(`${BASE}/E:A`))).toBe('CVSS-BT')
    expect(nomenclatureOf(parseV4(`${BASE}/MAV:L`))).toBe('CVSS-BE')
    expect(nomenclatureOf(parseV4(`${BASE}/E:A/MAV:L`))).toBe('CVSS-BTE')
    // Supplemental metrics do not change the nomenclature.
    expect(nomenclatureOf(parseV4(`${BASE}/R:I`))).toBe('CVSS-B')
  })
})
