import { describe, expect, it } from 'vitest'
import { MATCH_LIMIT, runRegex } from './regex'

describe('runRegex matching', () => {
  it('finds all matches with offsets when the g flag is set', () => {
    const { matches, truncated } = runRegex('a.', 'g', 'ab ac ad')
    expect(matches.map((m) => m.value)).toEqual(['ab', 'ac', 'ad'])
    expect(matches.map((m) => m.index)).toEqual([0, 3, 6])
    expect(matches.map((m) => m.end)).toEqual([2, 5, 8])
    expect(truncated).toBe(false)
  })

  it('finds only the first match without the g flag', () => {
    expect(runRegex('a.', '', 'ab ac').matches.map((m) => m.value)).toEqual(['ab'])
  })

  it('honors the i flag', () => {
    expect(runRegex('cat', 'gi', 'Cat CAT cat').matches).toHaveLength(3)
    expect(runRegex('cat', 'g', 'Cat CAT cat').matches).toHaveLength(1)
  })

  it('anchors ^ per line only with the m flag', () => {
    expect(runRegex('^\\w+', 'gm', 'one\ntwo').matches.map((m) => m.value)).toEqual(['one', 'two'])
    expect(runRegex('^\\w+', 'g', 'one\ntwo').matches.map((m) => m.value)).toEqual(['one'])
  })

  it('lets . cross newlines only with the s flag', () => {
    expect(runRegex('a.b', 's', 'a\nb').matches).toHaveLength(1)
    expect(runRegex('a.b', '', 'a\nb').matches).toHaveLength(0)
  })

  it('treats astral characters as one unit with the u flag', () => {
    expect(runRegex('.', 'gu', '🎉').matches.map((m) => m.value)).toEqual(['🎉'])
    expect(runRegex('.', 'g', '🎉').matches).toHaveLength(2)
  })

  it('stops at the first gap with the sticky y flag', () => {
    expect(runRegex('a', 'y', 'aab').matches.map((m) => m.index)).toEqual([0, 1])
  })

  it('terminates on zero-length matches', () => {
    const { matches } = runRegex('a*', 'g', 'bb')
    expect(matches.map((m) => m.index)).toEqual([0, 1, 2])
    expect(matches.every((m) => m.value === '')).toBe(true)
  })

  it('advances zero-length matches by code point under the u flag, like matchAll', () => {
    const reference = [...'🎉x'.matchAll(/(?:)/gu)].map((m) => m.index)
    expect(runRegex('(?:)', 'gu', '🎉x').matches.map((m) => m.index)).toEqual(reference)
  })

  it('caps the match list and reports truncation', () => {
    const { matches, truncated } = runRegex('.', 'g', 'x'.repeat(MATCH_LIMIT + 500))
    expect(matches).toHaveLength(MATCH_LIMIT)
    expect(truncated).toBe(true)
  })
})

describe('runRegex groups', () => {
  it('reports numbered and named groups per match', () => {
    const { matches } = runRegex('(?<user>\\w+)@(\\w+)', 'g', 'ann@ex bob@dev')
    expect(matches).toHaveLength(2)
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: 'ann', name: 'user' },
      { number: 2, value: 'ex', name: undefined },
    ])
    expect(matches[0]!.named).toEqual([{ name: 'user', value: 'ann' }])
    expect(matches[1]!.groups).toEqual([
      { number: 1, value: 'bob', name: 'user' },
      { number: 2, value: 'dev', name: undefined },
    ])
  })

  it('reports unmatched alternation groups as undefined', () => {
    const { matches } = runRegex('(a)|(b)', 'g', 'ab')
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: 'a' },
      { number: 2, value: undefined },
    ])
    expect(matches[1]!.groups).toEqual([
      { number: 1, value: undefined },
      { number: 2, value: 'b' },
    ])
  })

  it('attaches group names to their group numbers', () => {
    const { matches } = runRegex('(\\w+)@(?<domain>\\w+)', 'g', 'ann@ex')
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: 'ann', name: undefined },
      { number: 2, value: 'ex', name: 'domain' },
    ])
  })

  it('attaches the right name when two groups capture the same text', () => {
    const { matches } = runRegex('(?<a>x)(?<b>x)', 'g', 'xx')
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: 'x', name: 'a' },
      { number: 2, value: 'x', name: 'b' },
    ])
  })

  it('keeps a group name even when the group did not match', () => {
    const { matches } = runRegex('(?<a>a)|(?<b>b)', 'g', 'a')
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: 'a', name: 'a' },
      { number: 2, value: undefined, name: 'b' },
    ])
  })

  it('does not mistake lookbehind or a class bracket for a named group', () => {
    const { matches } = runRegex('(?<=x)([\\(]?)(?<num>\\d+)', 'g', 'x(42')
    expect(matches[0]!.groups).toEqual([
      { number: 1, value: '(', name: undefined },
      { number: 2, value: '42', name: 'num' },
    ])
  })

  it('reports no named groups when the pattern has none', () => {
    expect(runRegex('(a)', 'g', 'a').matches[0]!.named).toEqual([])
  })
})

describe('runRegex replace preview', () => {
  it('applies $n and $<name> references', () => {
    const result = runRegex('(?<first>\\w+) (\\w+)', 'g', 'john smith', '$2 $<first>')
    expect(result.replaced).toBe('smith john')
  })

  it('replaces only the first match without the g flag', () => {
    expect(runRegex('a', '', 'aaa', 'X').replaced).toBe('Xaa')
  })

  it('omits the replacement when none is given', () => {
    expect(runRegex('a', 'g', 'aaa').replaced).toBeUndefined()
  })
})

describe('runRegex errors', () => {
  it('throws a syntax error for an invalid pattern', () => {
    expect(() => runRegex('a(', 'g', 'x')).toThrow(/Invalid regular expression/)
  })

  it('throws for invalid or contradictory flags', () => {
    expect(() => runRegex('a', 'gg', 'x')).toThrow()
    expect(() => runRegex('a', 'uv', 'x')).toThrow()
    expect(() => runRegex('a', 'q', 'x')).toThrow()
  })
})
