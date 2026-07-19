import { describe, expect, it } from 'vitest'
import { detectAndParse, parseAs, stringifyAs } from './convert'

describe('detectAndParse', () => {
  it('detects JSON objects', () => {
    expect(detectAndParse('{"a": 1}').format).toBe('json')
  })

  it('detects TOML before YAML for key = value', () => {
    const d = detectAndParse('title = "hello"\n[server]\nport = 8080')
    expect(d.format).toBe('toml')
  })

  it('detects YAML for key: value', () => {
    expect(detectAndParse('server:\n  port: 8080').format).toBe('yaml')
  })

  it('detects bare scalars as JSON when valid, else YAML', () => {
    expect(detectAndParse('42').format).toBe('json')
    expect(detectAndParse('hello world').format).toBe('yaml')
  })

  it('reports per-format errors when nothing parses', () => {
    const d = detectAndParse('{"a": [1,')
    expect(d.format).toBeNull()
    if (d.format === null) {
      expect(d.errors.json.message).toBeTruthy()
      expect(d.errors.toml.line).toBeDefined()
      expect(d.errors.yaml.message).toBeTruthy()
    }
  })
})

describe('parse error positions', () => {
  it('yaml errors carry 1-based line/col', () => {
    const r = parseAs('a: 1\nb: [1, 2\nc: 3', 'yaml')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBeGreaterThanOrEqual(2)
  })

  it('toml errors carry line/col', () => {
    const r = parseAs('a = 1\nb = ', 'toml')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBe(2)
  })

  it('json errors carry line/col', () => {
    const r = parseAs('{\n  "a": oops\n}', 'json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBe(2)
  })
})

describe('YAML anchors and aliases', () => {
  it('expands aliases into real values', () => {
    const r = parseAs('base: &b\n  retries: 3\ncopy: *b', 'yaml')
    expect(r.ok && r.value).toEqual({ base: { retries: 3 }, copy: { retries: 3 } })
  })

  it('expanded aliases survive conversion to JSON', () => {
    const r = parseAs('list: &l [1, 2]\nagain: *l', 'yaml')
    const out = stringifyAs(r.ok ? r.value : null, 'json')
    expect(JSON.parse(out.output!)).toEqual({ list: [1, 2], again: [1, 2] })
  })
})

describe('round trips preserve data', () => {
  const data = {
    name: 'test',
    count: 3,
    pi: 3.14,
    flag: true,
    tags: ['a', 'b'],
    nested: { deep: { x: 1 } },
  }

  it('json → yaml → json', () => {
    const yaml = stringifyAs(data, 'yaml').output!
    const back = parseAs(yaml, 'yaml')
    expect(back.ok && back.value).toEqual(data)
  })

  it('json → toml → json', () => {
    const toml = stringifyAs(data, 'toml').output!
    const back = parseAs(toml, 'toml')
    expect(JSON.parse(stringifyAs(back.ok ? back.value : null, 'json').output!)).toEqual(data)
  })
})

describe('TOML datetimes', () => {
  it('convert to ISO strings in JSON', () => {
    const r = parseAs('when = 2024-07-09T14:30:00Z', 'toml')
    const json = stringifyAs(r.ok ? r.value : null, 'json').output!
    expect(JSON.parse(json).when).toBe('2024-07-09T14:30:00.000Z')
  })

  it('convert to plain ISO scalars in YAML (YAML 1.2 has no date type)', () => {
    const r = parseAs('when = 2024-07-09T14:30:00Z', 'toml')
    const yaml = stringifyAs(r.ok ? r.value : null, 'yaml').output!
    expect(yaml).toBe('when: 2024-07-09T14:30:00.000Z')
    const back = parseAs(yaml, 'yaml')
    expect(back.ok && back.value).toEqual({ when: '2024-07-09T14:30:00.000Z' })
  })

  it('YAML timestamp strings become quoted TOML strings', () => {
    const r = parseAs('when: 2024-07-09T14:30:00Z', 'yaml')
    const toml = stringifyAs(r.ok ? r.value : null, 'toml')
    expect(toml.output).toBe('when = "2024-07-09T14:30:00Z"')
  })
})

describe('TOML limitations', () => {
  it('warns about dropped nulls', () => {
    const out = stringifyAs({ a: 1, b: null, c: { d: null } }, 'toml')
    expect(out.ok).toBe(true)
    expect(out.warnings[0]).toContain('2 null values were omitted')
    expect(out.output).not.toContain('b')
  })

  it('rejects non-object roots', () => {
    expect(stringifyAs([1, 2, 3], 'toml').ok).toBe(false)
    expect(stringifyAs('scalar', 'toml').ok).toBe(false)
  })
})

describe('bigint handling', () => {
  it('TOML big integers stay exact in TOML → TOML output', () => {
    const r = parseAs('big = 92233720368547758079', 'toml')
    expect(r.ok).toBe(true)
    const out = stringifyAs(r.ok ? r.value : null, 'toml')
    expect(out.output).toBe('big = 92233720368547758079')
    expect(out.warnings).toEqual([])
  })

  it('i64-range integers survive TOML → JSON as strings when unsafe', () => {
    const r = parseAs('big = 9223372036854775807', 'toml')
    expect(r.ok).toBe(true)
    const out = stringifyAs(r.ok ? r.value : null, 'json')
    expect(out.output).toContain('"9223372036854775807"')
    expect(out.warnings[0]).toContain('double precision')
  })
})
