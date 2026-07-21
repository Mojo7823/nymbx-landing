import { describe, expect, it } from 'vitest'
import { countText } from './count'

describe('countText', () => {
  it('returns all zeros for empty text', () => {
    expect(countText('')).toEqual({
      graphemes: 0,
      graphemesNoSpaces: 0,
      words: 0,
      sentences: 0,
      lines: 0,
      paragraphs: 0,
      tokens: 0,
      readingMinutes: 0,
    })
  })

  it('counts words, sentences, lines and paragraphs in plain English', () => {
    const stats = countText('Hello world. How are you?\n\nNew paragraph here.')
    expect(stats.words).toBe(8)
    expect(stats.sentences).toBe(3)
    expect(stats.lines).toBe(3)
    expect(stats.paragraphs).toBe(2)
  })

  it('counts characters with and without spaces', () => {
    const stats = countText('a b\tc')
    expect(stats.graphemes).toBe(5)
    expect(stats.graphemesNoSpaces).toBe(3)
  })

  it('counts emoji and flags as single characters (grapheme clusters)', () => {
    const stats = countText('👩‍👩‍👧‍👦🎉🇹🇼')
    expect(stats.graphemes).toBe(3)
    expect(stats.graphemesNoSpaces).toBe(3)
  })

  it('does not count punctuation or whitespace as words', () => {
    expect(countText('one, two — three!').words).toBe(3)
  })

  it('segments CJK text into words instead of space-splitting', () => {
    const stats = countText('我愛北京天安門')
    expect(stats.words).toBeGreaterThan(1)
    expect(stats.words).toBeLessThanOrEqual(7)
  })

  it('counts sentences ended by ., ! and ?', () => {
    expect(countText('One. Two! Three?').sentences).toBe(3)
  })

  it('counts lines by newline', () => {
    expect(countText('a\nb\nc').lines).toBe(3)
    expect(countText('single').lines).toBe(1)
  })

  it('counts blank-line separated paragraphs, ignoring whitespace-only blocks', () => {
    expect(countText('p1\n\np2\n\n\n\np3').paragraphs).toBe(3)
    expect(countText('p1\n\n   \n\np2').paragraphs).toBe(2)
    expect(countText('one\ntwo\nthree').paragraphs).toBe(1)
  })

  it('estimates tokens at roughly 4 characters each for latin text', () => {
    expect(countText('a'.repeat(40)).tokens).toBe(10)
  })

  it('estimates tokens at roughly one per CJK character', () => {
    expect(countText('中'.repeat(10)).tokens).toBe(10)
  })

  it('estimates reading time from the word count', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ')
    expect(countText(words).readingMinutes).toBe(2)
  })
})
