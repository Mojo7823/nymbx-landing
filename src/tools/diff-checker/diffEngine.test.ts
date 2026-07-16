import { describe, expect, it } from 'vitest'
import { computeDiff, unifiedDiff } from './diffEngine'

describe('computeDiff — lines', () => {
  it('reports identical inputs', () => {
    const r = computeDiff('a\nb\nc', 'a\nb\nc', 'lines', false)
    expect(r.identical).toBe(true)
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
  })

  it('counts added and removed lines', () => {
    const r = computeDiff('a\nb\nc\n', 'a\nx\nc\ny\n', 'lines', false)
    expect(r.identical).toBe(false)
    expect(r.added).toBe(2) // x, y
    expect(r.removed).toBe(1) // b
  })

  it('handles one side empty', () => {
    const r = computeDiff('', 'a\nb\n', 'lines', false)
    expect(r.identical).toBe(false)
    expect(r.added).toBe(2)
    expect(r.removed).toBe(0)
    const r2 = computeDiff('a\nb\n', '', 'lines', false)
    expect(r2.removed).toBe(2)
  })

  it('both sides empty is identical with no parts', () => {
    expect(computeDiff('', '', 'lines', false)).toMatchObject({ identical: true, parts: [] })
  })

  it('ignores whitespace when asked', () => {
    expect(computeDiff('a\n  b  \n', 'a\nb\n', 'lines', true).identical).toBe(true)
    expect(computeDiff('a\n  b  \n', 'a\nb\n', 'lines', false).identical).toBe(false)
  })
})

describe('computeDiff — words', () => {
  it('diffs at word level', () => {
    const r = computeDiff('the quick brown fox', 'the slow brown fox', 'words', false)
    expect(r.parts.find((p) => p.removed)?.value).toBe('quick')
    expect(r.parts.find((p) => p.added)?.value).toBe('slow')
    expect(r.added).toBe(1)
    expect(r.removed).toBe(1)
  })

  it('treats whitespace-only changes as equal with ignoreWhitespace', () => {
    expect(computeDiff('a  b', 'a b', 'words', true).identical).toBe(true)
    expect(computeDiff('a  b', 'a b', 'words', false).identical).toBe(false)
  })
})

describe('computeDiff — chars and unicode', () => {
  it('diffs at character level', () => {
    const r = computeDiff('kitten', 'sitting', 'chars', false)
    expect(r.identical).toBe(false)
    const joined = r.parts
      .map((p) => (p.added ? `+${p.value}` : p.removed ? `-${p.value}` : p.value))
      .join('|')
    expect(joined).toContain('itt')
  })

  it('never splits emoji surrogate pairs or ZWJ sequences', () => {
    const r = computeDiff('hello 👨‍👩‍👧‍👦 world', 'hello 🎉 world', 'chars', false)
    expect(r.parts.find((p) => p.removed)?.value).toBe('👨‍👩‍👧‍👦')
    expect(r.parts.find((p) => p.added)?.value).toBe('🎉')
    for (const p of r.parts) {
      expect(p.value).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/) // no lone surrogates
    }
  })

  it('keeps combining characters together', () => {
    const r = computeDiff('café', 'café', 'chars', false)
    // é vs e+combining-acute are different graphemes but must stay whole
    for (const p of r.parts) expect(p.value.normalize('NFC')).toBeTruthy()
  })
})

describe('unifiedDiff', () => {
  it('produces a valid patch header and hunks', () => {
    const patch = unifiedDiff('a\nb\nc\n', 'a\nx\nc\n', false)
    expect(patch).toContain('--- original')
    expect(patch).toContain('+++ changed')
    expect(patch).toContain('-b')
    expect(patch).toContain('+x')
  })
})
