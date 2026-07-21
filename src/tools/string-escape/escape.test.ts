import { describe, expect, it } from 'vitest'
import { escapeText, unescapeText, type EscapeMode } from './escape'

const TORTURE = 'He said "hi" \\ there\n\ttab, $HOME `cmd` <b>5 > 3 & café</b> it\'s $5.99 (a+b)*'

describe('json mode', () => {
  it('escapes quotes, backslashes and control characters', () => {
    expect(escapeText('He said "hi"\nnew\tline \\ done', 'json')).toBe(
      'He said \\"hi\\"\\nnew\\tline \\\\ done',
    )
  })

  it('leaves unicode text readable', () => {
    expect(escapeText('café 中文 🎉', 'json')).toBe('café 中文 🎉')
  })

  it('unescapes back to the original', () => {
    expect(unescapeText('He said \\"hi\\"\\nnew\\tline', 'json')).toBe('He said "hi"\nnew\tline')
  })

  it('rejects invalid escape sequences with a clear error', () => {
    expect(() => unescapeText('bad \\q escape', 'json')).toThrow(/JSON/i)
    expect(() => unescapeText('unescaped " quote', 'json')).toThrow(/JSON/i)
  })
})

describe('html mode', () => {
  it('escapes markup and non-ASCII with named entities', () => {
    const escaped = escapeText('<b>5 > 3 & "café"</b>', 'html')
    expect(escaped).toContain('&lt;b&gt;')
    expect(escaped).toContain('&amp;')
    expect(escaped).toContain('&eacute;')
    expect(escaped).not.toContain('<b>')
  })

  it('decodes named, decimal and hex entities alike', () => {
    expect(unescapeText('caf&eacute; caf&#233; caf&#xE9;', 'html')).toBe('café café café')
  })

  it('decodes entities without trailing semicolons where legacy HTML allows it', () => {
    expect(unescapeText('fish &amp chips', 'html')).toBe('fish & chips')
  })
})

describe('url mode', () => {
  it('percent-encodes reserved characters', () => {
    expect(escapeText('a=1&b=2 c/d?', 'url')).toBe('a%3D1%26b%3D2%20c%2Fd%3F')
  })

  it('rejects broken percent escapes', () => {
    expect(() => unescapeText('abc%2', 'url')).toThrow(/percent/i)
  })
})

describe('shell modes', () => {
  it('single-quote wraps and escapes embedded single quotes', () => {
    expect(escapeText('it\'s a "test".txt', 'shell-single')).toBe("'it'\\''s a \"test\".txt'")
    expect(escapeText('', 'shell-single')).toBe("''")
  })

  it('single-quote unescape reverses the wrapping', () => {
    expect(unescapeText("'it'\\''s a \"test\".txt'", 'shell-single')).toBe('it\'s a "test".txt')
  })

  it('single-quote unescape requires surrounding quotes', () => {
    expect(() => unescapeText('no quotes', 'shell-single')).toThrow(/quote/i)
  })

  it('double-quote wraps and escapes $ ` " and backslash', () => {
    expect(escapeText('say "$HOME" `cmd` \\', 'shell-double')).toBe(
      '"say \\"\\$HOME\\" \\`cmd\\` \\\\"',
    )
  })

  it('double-quote unescape reverses the wrapping', () => {
    expect(unescapeText('"say \\"\\$HOME\\" \\`cmd\\` \\\\"', 'shell-double')).toBe(
      'say "$HOME" `cmd` \\',
    )
  })
})

describe('regex mode', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeText('price $5.99 (approx)*', 'regex')).toBe('price \\$5\\.99 \\(approx\\)\\*')
  })

  it('escaped text matches itself literally as a pattern', () => {
    const source = 'a+b (c|d) [e] {2} ^$ . * ? / \\'
    const re = new RegExp(escapeText(source, 'regex'))
    expect(re.test(source)).toBe(true)
    expect(re.test('aab (c|d)')).toBe(false)
  })

  it('unescape strips the added backslashes', () => {
    expect(unescapeText('price \\$5\\.99', 'regex')).toBe('price $5.99')
  })
})

describe('round trips and nesting', () => {
  const MODES: EscapeMode[] = ['json', 'html', 'url', 'shell-single', 'shell-double', 'regex']

  it('every mode round-trips a torture string', () => {
    for (const mode of MODES) {
      expect(unescapeText(escapeText(TORTURE, mode), mode), mode).toBe(TORTURE)
    }
  })

  it('json-in-json peels one layer per pass, never both at once', () => {
    const original = 'log: "level"\n'
    const once = escapeText(original, 'json')
    const twice = escapeText(once, 'json')
    expect(unescapeText(twice, 'json')).toBe(once)
    expect(unescapeText(once, 'json')).toBe(original)
  })
})
