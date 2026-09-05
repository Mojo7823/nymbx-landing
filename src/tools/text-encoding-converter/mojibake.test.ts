import { describe, expect, it } from 'vitest'
import { repair, REPAIR_SOURCES, suggest } from './mojibake'
import { canonicalLabel } from './legacyEncoder'
import samples from './fixtures/samples.json'

const cases = samples.mojibake

describe('repair', () => {
  it('has 8 fixture cases, 2 of them lossy', () => {
    expect(cases).toHaveLength(8)
    expect(cases.filter((c) => c.lossy)).toHaveLength(2)
  })

  for (const [index, entry] of cases.entries()) {
    const name = `${entry.decodedAs} → ${entry.actual}${entry.lossy ? ' (lossy)' : ''}`
    it(`repairs ${name} (#${index})`, () => {
      const result = repair(entry.garbled, entry.decodedAs, entry.actual)
      if (entry.lossy) {
        // The wrong decoder threw bytes away, so an exact repair is impossible.
        expect(result.text).toContain('�')
        expect(result.lost + result.replacements).toBeGreaterThan(0)
        expect(result.text.slice(0, 3)).toBe(entry.truth.slice(0, 3))
      } else {
        expect(result.text).toBe(entry.truth)
        expect(result.lost).toBe(0)
        expect(result.replacements).toBe(0)
      }
    })
  }
})

describe('suggest', () => {
  it('returns nothing for empty input', () => {
    expect(suggest('')).toEqual([])
  })

  it('offers at most five suggestions', () => {
    expect(suggest(cases[0].garbled).length).toBeLessThanOrEqual(5)
  })

  it('only proposes encodings from the candidate list', () => {
    for (const suggestion of suggest(cases[0].garbled)) {
      expect(REPAIR_SOURCES).toContain(suggestion.decodedAs)
    }
  })

  it('puts the right pair first for the non-lossy cases', () => {
    const eligible = cases.filter(
      (c) => !c.lossy && (c.actual === 'utf-8' || [...c.garbled].length >= 20),
    )
    expect(eligible.length).toBeGreaterThanOrEqual(4)

    const correct = eligible.filter((entry) => {
      const top = suggest(entry.garbled)[0]
      return (
        top !== undefined &&
        canonicalLabel(top.decodedAs) === canonicalLabel(entry.decodedAs) &&
        canonicalLabel(top.actual) === canonicalLabel(entry.actual)
      )
    })
    expect(
      correct.length,
      `${correct.length}/${eligible.length} pairs identified`,
    ).toBeGreaterThanOrEqual(4)
  })

  it('recovers the original text in its top suggestion for classic Latin mojibake', () => {
    const entry = cases.find(
      (c) => !c.lossy && c.decodedAs === 'windows-1252' && c.actual === 'utf-8',
    )!
    const top = suggest(entry.garbled)[0]
    expect(top.text).toBe(entry.truth)
    expect(top.lost).toBe(0)
  })
})
