import { describe, expect, it } from 'vitest'
import { normalizeHash, parseHash, toHash } from './hash'
import { formatV31 } from './v31/metrics'
import { formatV4 } from './v4/metrics'

const V31 = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
const V4 = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'

describe('normalizeHash', () => {
  it('strips the leading # and percent-decodes', () => {
    expect(normalizeHash(`#${V31}`)).toBe(V31)
    expect(normalizeHash('#CVSS%3A4.0')).toBe('CVSS:4.0')
  })

  it('survives an undecodable hash', () => {
    expect(normalizeHash('#%E0%A4%A')).toBe('%E0%A4%A')
  })
})

describe('parseHash', () => {
  it('reports an empty hash', () => {
    expect(parseHash('')).toEqual({ kind: 'empty' })
    expect(parseHash('#')).toEqual({ kind: 'empty' })
  })

  it('recognises a v3.1 vector', () => {
    const result = parseHash(toHash(V31))
    expect(result.kind).toBe('v31')
    if (result.kind !== 'v31') throw new Error('expected v31')
    expect(formatV31(result.selection)).toBe(V31)
    expect(result.wasV30).toBe(false)
  })

  it('recognises a v3.0 vector and flags it', () => {
    const result = parseHash(toHash(V31.replace('3.1', '3.0')))
    expect(result.kind).toBe('v31')
    if (result.kind !== 'v31') throw new Error('expected v31')
    expect(result.wasV30).toBe(true)
  })

  it('recognises a v4.0 vector, whatever the case', () => {
    const result = parseHash(toHash(V4.toLowerCase()))
    expect(result.kind).toBe('v4')
    if (result.kind !== 'v4') throw new Error('expected v4')
    expect(formatV4(result.selection)).toBe(V4)
  })

  it('reports an unparsable vector with the parser message', () => {
    const result = parseHash('#CVSS:4.0/AV:Q')
    expect(result).toEqual({
      kind: 'invalid',
      message: expect.stringContaining('Invalid value "Q" for metric AV in segment 2'),
    })
  })

  it('reports a hash that is not a CVSS vector at all', () => {
    expect(parseHash('#hello')).toEqual({
      kind: 'invalid',
      message: 'The link did not contain a CVSS v3.1 or v4.0 vector.',
    })
  })
})

describe('toHash', () => {
  it('prefixes the vector with #', () => {
    expect(toHash(V4)).toBe(`#${V4}`)
  })
})
