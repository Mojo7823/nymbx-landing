import { describe, expect, it } from 'vitest'
import { errorExcerpt, formatJson, isRiskyInteger, minifyJson, validateJson } from './jsonTools'

describe('formatJson', () => {
  it('pretty-prints with the given indent', () => {
    const r = formatJson('{"a":[1,2],"b":{"c":null}}', '  ')
    expect(r.ok).toBe(true)
    expect(r.output).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}')
  })

  it('keeps empty containers compact', () => {
    expect(formatJson('{"a":{},"b":[]}', '  ').output).toBe('{\n  "a": {},\n  "b": []\n}')
  })

  it('preserves big integers byte-exact and flags them', () => {
    const r = formatJson('{"id":92233720368547758079}', '  ')
    expect(r.output).toContain('92233720368547758079')
    expect(r.riskyNumbers).toBe(1)
  })

  it('does not flag safe integers or decimals', () => {
    const r = formatJson('[9007199254740991, 3.141592653589793, 1e300]', '  ')
    expect(r.riskyNumbers).toBe(0)
  })

  it('preserves escapes and unicode in strings', () => {
    const src = '{"s":"line\\n \\u00e9 \\" \\\\ 中"}'
    expect(formatJson(src, '  ').output).toContain('"line\\n \\u00e9 \\" \\\\ 中"')
  })
})

describe('minify / round trip', () => {
  it('minifies whitespace away', () => {
    expect(minifyJson('{\n  "a" : [ 1 , 2 ]\n}').output).toBe('{"a":[1,2]}')
  })

  it('format → minify → format is lossless', () => {
    const src =
      '{"big":123456789012345678901234567890,"neg":-0.5e-10,"s":"x\\ty","arr":[true,false,null]}'
    const formatted = formatJson(src, '    ').output!
    const minified = minifyJson(formatted).output!
    expect(minified).toBe(src)
    expect(formatJson(minified, '    ').output).toBe(formatted)
  })
})

describe('validateJson errors', () => {
  it('reports line and column of a trailing comma', () => {
    const r = validateJson('{\n  "a": 1,\n}')
    expect(r.ok).toBe(false)
    expect(r.error).toMatchObject({ line: 3, col: 1 })
    expect(r.error!.message).toContain('object key')
  })

  it('reports unterminated strings at their opening quote', () => {
    const r = validateJson('{"a": "oops}')
    expect(r.error).toMatchObject({ message: 'Unterminated string', line: 1, col: 7 })
  })

  it('reports invalid escapes', () => {
    expect(validateJson('"bad \\x escape"').error!.message).toContain('escape')
  })

  it('reports unquoted keys', () => {
    expect(validateJson('{a: 1}').error).toMatchObject({ line: 1, col: 2 })
  })

  it('reports trailing garbage', () => {
    const r = validateJson('{} extra')
    expect(r.error!.message).toContain('trailing')
    expect(r.error).toMatchObject({ line: 1, col: 4 })
  })

  it('reports unexpected end of input', () => {
    expect(validateJson('{"a": ').error!.message).toContain('end of input')
  })

  it('rejects bare words and numbers with leading zeros', () => {
    expect(validateJson('undefined').ok).toBe(false)
    expect(validateJson('01').ok).toBe(false)
  })

  it('accepts all scalar roots', () => {
    for (const src of ['true', 'false', 'null', '42', '-0.5', '"hi"']) {
      expect(validateJson(src).ok).toBe(true)
    }
  })
})

describe('isRiskyInteger', () => {
  it('draws the line at MAX_SAFE_INTEGER', () => {
    expect(isRiskyInteger('9007199254740991')).toBe(false)
    expect(isRiskyInteger('9007199254740992')).toBe(true)
    expect(isRiskyInteger('-9007199254740992')).toBe(true)
    expect(isRiskyInteger('123')).toBe(false)
    expect(isRiskyInteger('1.23e20')).toBe(false)
  })
})

describe('errorExcerpt', () => {
  it('marks the column with a caret', () => {
    const r = validateJson('{"a": nul}')
    const { line, caret } = errorExcerpt('{"a": nul}', r.error!)
    expect(line).toBe('{"a": nul}')
    expect(caret.indexOf('^')).toBe(r.error!.col - 1)
  })

  it('windows very long lines around the caret', () => {
    const src = '[' + '1,'.repeat(100) + 'x]'
    const r = validateJson(src)
    const { line, caret } = errorExcerpt(src, r.error!)
    expect(line.length).toBeLessThanOrEqual(81)
    expect(caret).toContain('^')
  })
})
