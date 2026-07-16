import { describe, expect, it } from 'vitest'
import { collapseBlankLines, type CollapseOptions } from './collapseLines'

const one: CollapseOptions = { mode: 'one', trimTrailing: false }
const zero: CollapseOptions = { mode: 'zero', trimTrailing: false }

describe('collapseBlankLines — one mode', () => {
  it('collapses 2+ consecutive blank lines to a single blank line', () => {
    expect(collapseBlankLines('a\n\n\n\nb', one).output).toBe('a\n\nb')
  })

  it('leaves single blank lines alone', () => {
    expect(collapseBlankLines('a\n\nb', one).output).toBe('a\n\nb')
  })

  it('treats whitespace-only lines as blank and empties the kept one', () => {
    expect(collapseBlankLines('a\n \t \n   \nb', one).output).toBe('a\n\nb')
  })

  it('collapses leading and trailing runs too', () => {
    expect(collapseBlankLines('\n\n\na\n\n\n', one).output).toBe('\na\n\n')
  })

  it('reduces a file entirely of newlines to one blank line', () => {
    expect(collapseBlankLines('\n\n\n\n\n', one).output).toBe('\n')
  })
})

describe('collapseBlankLines — zero mode', () => {
  it('removes all blank lines', () => {
    expect(collapseBlankLines('a\n\n\nb\n\nc', zero).output).toBe('a\nb\nc')
  })

  it('empties a file entirely of newlines', () => {
    expect(collapseBlankLines('\n\n\n\n', zero).output).toBe('')
  })
})

describe('collapseBlankLines — line endings', () => {
  it('preserves CRLF endings', () => {
    expect(collapseBlankLines('a\r\n\r\n\r\nb\r\n', one).output).toBe('a\r\n\r\nb\r\n')
  })

  it('preserves LF endings and the trailing newline', () => {
    expect(collapseBlankLines('a\n\n\nb\n', one).output).toBe('a\n\nb\n')
    expect(collapseBlankLines('a\n\n\nb', one).output).toBe('a\n\nb')
  })
})

describe('collapseBlankLines — trim trailing whitespace', () => {
  const oneTrim: CollapseOptions = { mode: 'one', trimTrailing: true }

  it('strips trailing spaces and tabs from kept lines', () => {
    expect(collapseBlankLines('a  \nb\t\nc', oneTrim).output).toBe('a\nb\nc')
  })

  it('keeps leading indentation', () => {
    expect(collapseBlankLines('  indented  ', oneTrim).output).toBe('  indented')
  })
})

describe('collapseBlankLines — general behavior', () => {
  it('handles empty input', () => {
    expect(collapseBlankLines('', one)).toEqual({ output: '', linesBefore: 0, linesAfter: 0 })
  })

  it('reports before/after line counts', () => {
    const r = collapseBlankLines('a\n\n\n\nb', one)
    expect(r.linesBefore).toBe(5)
    expect(r.linesAfter).toBe(3)
  })

  it('is idempotent in every mode combination', () => {
    const sample = '  a  \n\n\n \t \nb\r\n\r\n\r\nc\n\n'
    for (const mode of ['one', 'zero'] as const) {
      for (const trimTrailing of [false, true]) {
        const first = collapseBlankLines(sample, { mode, trimTrailing }).output
        const second = collapseBlankLines(first, { mode, trimTrailing }).output
        expect(second).toBe(first)
      }
    }
  })
})
