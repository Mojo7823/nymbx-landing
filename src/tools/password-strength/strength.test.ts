import { describe, expect, it } from 'vitest'
import { checkStrength, formatGuesses, MAX_ANALYZED_LENGTH } from './strength'

describe('password strength', () => {
  it('returns null for empty input (nothing to show)', () => {
    expect(checkStrength('')).toBeNull()
  })

  it('scores textbook-weak passwords 0 with actionable feedback', () => {
    for (const weak of ['password', '123456', 'qwerty', 'letmein']) {
      const r = checkStrength(weak)
      expect(r).not.toBeNull()
      expect(r!.score).toBeLessThanOrEqual(1)
      expect(r!.warning ?? r!.suggestions.join(' ')).not.toBe('')
    }
  })

  it('flags keyboard walks as low-score with a keyboard-pattern note', () => {
    const r = checkStrength('mnbvcxzlkjhg')!
    expect(r.score).toBeLessThanOrEqual(1)
    expect(r.patterns).toContain('Keyboard pattern')
  })

  it('scores a long random password 4 with century-scale crack times', () => {
    const r = checkStrength('Tr7o9ub!xQ2#mZvBn4$kL9@dF')!
    expect(r.score).toBe(4)
    expect(r.warning).toBeNull()
    expect(r.crackTimes).toHaveLength(4)
    expect(r.crackTimes[0]!.display).toBe('centuries')
  })

  it('scores a multi-word passphrase strongly', () => {
    const r = checkStrength('correct horse battery staple')!
    expect(r.score).toBeGreaterThanOrEqual(3)
  })

  it('reports guesses, score label, and detected patterns', () => {
    const r = checkStrength('password123')!
    expect(r.guesses).toBeGreaterThan(0)
    expect(r.guessesDisplay).not.toBe('')
    expect(r.scoreLabel).not.toBe('')
    expect(r.patterns.length).toBeGreaterThan(0)
  })

  it('analyzes only a prefix of very long input and says so', () => {
    const r = checkStrength('a'.repeat(MAX_ANALYZED_LENGTH + 100))!
    expect(r.truncated).toBe(true)
    expect(checkStrength('a'.repeat(10))!.truncated).toBe(false)
  })

  it('formats guess counts readably', () => {
    expect(formatGuesses(42)).toBe('42')
    expect(formatGuesses(1_234_567)).toMatch(/1\.2 × 10\^6/)
    expect(formatGuesses(Infinity)).toBe('more than countable')
  })
})
