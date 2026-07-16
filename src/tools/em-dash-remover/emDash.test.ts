import { describe, expect, it } from 'vitest'
import { replaceDashes, type EmDashOptions } from './emDash'

const hyphen: EmDashOptions = { mode: 'hyphen', includeEnDash: false }
const comma: EmDashOptions = { mode: 'comma', includeEnDash: false }
const remove: EmDashOptions = { mode: 'remove', includeEnDash: false }

describe('replaceDashes — hyphen mode', () => {
  it('replaces an em-dash mid-word', () => {
    expect(replaceDashes('co—operate', hyphen)).toEqual({ output: 'co-operate', count: 1 })
  })

  it('preserves surrounding spacing', () => {
    expect(replaceDashes('a — b', hyphen).output).toBe('a - b')
  })

  it('replaces multiple dashes per line and counts each', () => {
    expect(replaceDashes('a—b—c—d', hyphen)).toEqual({ output: 'a-b-c-d', count: 3 })
  })

  it('handles dashes at line start and end', () => {
    expect(replaceDashes('—start and end—', hyphen).output).toBe('-start and end-')
  })

  it('ignores en-dashes unless enabled', () => {
    expect(replaceDashes('a – b', hyphen)).toEqual({ output: 'a – b', count: 0 })
    expect(replaceDashes('a – b — c', { ...hyphen, includeEnDash: true })).toEqual({
      output: 'a - b - c',
      count: 2,
    })
  })
})

describe('replaceDashes — comma mode', () => {
  it('normalizes surrounding spaces to a comma and space', () => {
    expect(replaceDashes('one — two', comma).output).toBe('one, two')
    expect(replaceDashes('one—two', comma).output).toBe('one, two')
  })

  it('strips a dash dangling at line start or end', () => {
    expect(replaceDashes('— leading', comma).output).toBe('leading')
    expect(replaceDashes('trailing —', comma).output).toBe('trailing')
    expect(replaceDashes('a —\nb', comma).output).toBe('a\nb')
  })

  it('counts every dash in a run but replaces the run once', () => {
    expect(replaceDashes('a —— b', comma)).toEqual({ output: 'a, b', count: 2 })
  })
})

describe('replaceDashes — remove mode', () => {
  it('fuses words when the dash had no spacing', () => {
    expect(replaceDashes('co—operate', remove).output).toBe('cooperate')
  })

  it('keeps a single space when the dash separated words', () => {
    expect(replaceDashes('one — two', remove).output).toBe('one two')
    expect(replaceDashes('one —two', remove).output).toBe('one two')
  })

  it('strips dashes at line boundaries without leaving spaces', () => {
    expect(replaceDashes('— item', remove).output).toBe('item')
    expect(replaceDashes('trails off—\nnext', remove).output).toBe('trails off\nnext')
  })
})

describe('replaceDashes — general behavior', () => {
  it('returns empty output for empty input', () => {
    expect(replaceDashes('', hyphen)).toEqual({ output: '', count: 0 })
    expect(replaceDashes('', comma)).toEqual({ output: '', count: 0 })
  })

  it('leaves text without dashes untouched', () => {
    const text = 'plain text with a hyphen-minus - and nothing else\n'
    expect(replaceDashes(text, comma)).toEqual({ output: text, count: 0 })
  })

  it('preserves CRLF line endings', () => {
    expect(replaceDashes('a —\r\nb — c', comma).output).toBe('a\r\nb, c')
  })

  it('handles large inputs correctly', () => {
    const line = 'lorem ipsum — dolor sit amet, consectetur — adipiscing elit\n'
    const big = line.repeat(20_000) // ~1.2 MB
    const result = replaceDashes(big, hyphen)
    expect(result.count).toBe(40_000)
    expect(result.output).toBe(
      'lorem ipsum - dolor sit amet, consectetur - adipiscing elit\n'.repeat(20_000),
    )
  })
})
