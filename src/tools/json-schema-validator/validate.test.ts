import { describe, expect, it, vi } from 'vitest'
import { MAX_INPUT_BYTES } from './model'
import type { Draft } from './model'
import { validateJsonSchema } from './validate'

function validate(schema: unknown, instance: unknown, draft: Draft = 'auto') {
  return validateJsonSchema(JSON.stringify(schema), JSON.stringify(instance), draft)
}

describe('validateJsonSchema', () => {
  it('accepts a matching document and defaults to draft-07', () => {
    expect(
      validate(
        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        { name: 'Ada' },
      ),
    ).toEqual({
      ok: true,
      valid: true,
      draft: 'draft-07',
      errors: [],
      totalErrors: 0,
    })
  })

  it('reports missing, additional, nested array, and escaped property pointers', () => {
    const result = validate(
      {
        type: 'object',
        required: ['missing/~'],
        additionalProperties: false,
        properties: {
          'items/~': {
            type: 'array',
            items: {
              type: 'object',
              required: ['a/b~c'],
              properties: { count: { type: 'integer' } },
            },
          },
        },
      },
      { 'extra/~': true, 'items/~': [{ count: 'wrong' }] },
    )
    expect(result).toMatchObject({ ok: true, valid: false, totalErrors: 4 })
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/missing~1~0',
          schemaPath: '#/required',
          keyword: 'required',
        }),
        expect.objectContaining({
          instancePath: '/extra~1~0',
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
        }),
        expect.objectContaining({ instancePath: '/items~1~0/0/a~1b~0c', keyword: 'required' }),
        expect.objectContaining({
          instancePath: '/items~1~0/0/count',
          schemaPath: '#/properties/items~1~0/items/properties/count/type',
          keyword: 'type',
        }),
      ]),
    )
  })

  it('preserves root and empty-property JSON pointer meanings', () => {
    expect(validate({ type: 'integer' }, '3').errors).toEqual([
      expect.objectContaining({ instancePath: '', schemaPath: '#/type', keyword: 'type' }),
    ])
    expect(validate({ required: [''] }, {}).errors).toEqual([
      expect.objectContaining({ instancePath: '/', keyword: 'required' }),
    ])
  })

  it.each<Draft>(['draft-07', '2019-09'])(
    'supports draft %s tuple schemas without strict tuple restrictions',
    (draft) => {
      const schema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'integer' }],
        additionalItems: false,
      }
      expect(validate(schema, ['hello', 1], draft)).toMatchObject({ ok: true, valid: true, draft })
      expect(validate(schema, ['hello', '1'], draft).errors).toEqual([
        expect.objectContaining({ instancePath: '/1', keyword: 'type' }),
      ])
      expect(validate(schema, ['hello', 1, true], draft)).toMatchObject({ ok: true, valid: false })
      expect(
        validate({ type: 'array', items: [{ type: 'string' }] }, ['hello', true], draft),
      ).toMatchObject({ ok: true, valid: true })
    },
  )

  it('supports 2020-12 prefixItems and rejects obsolete tuple items', () => {
    const schema = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'integer' }],
      items: false,
    }
    expect(validate(schema, ['hello', 1], '2020-12')).toMatchObject({ ok: true, valid: true })
    expect(validate(schema, ['hello', 1, 2], '2020-12')).toMatchObject({ ok: true, valid: false })
    expect(validate({ items: [{ type: 'string' }] }, ['hello'], '2020-12')).toMatchObject({
      ok: false,
      source: 'schema',
    })
    expect(validate(schema, ['hello', 1], 'draft-07')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('prefixItems'),
    })
  })

  it.each<Draft>(['2019-09', '2020-12'])(
    'enforces unevaluatedProperties across allOf in %s',
    (draft) => {
      const schema = {
        type: 'object',
        allOf: [{ properties: { name: { type: 'string' } } }],
        unevaluatedProperties: false,
      }
      expect(validate(schema, { name: 'Ada' }, draft)).toMatchObject({ ok: true, valid: true })
      expect(validate(schema, { name: 'Ada', 'other/~': 1 }, draft).errors).toEqual([
        expect.objectContaining({
          instancePath: '/other~1~0',
          schemaPath: '#/unevaluatedProperties',
          keyword: 'unevaluatedProperties',
        }),
      ])
      expect(validate(schema, { name: 'Ada' }, 'draft-07')).toMatchObject({
        ok: false,
        source: 'schema',
        message: expect.stringContaining('unevaluatedProperties'),
      })
    },
  )

  it('accepts null with true schemas and rejects primitive values with false schemas', () => {
    expect(validate(true, null)).toMatchObject({ ok: true, valid: true })
    expect(validate(false, 0)).toMatchObject({
      ok: true,
      valid: false,
      totalErrors: 1,
      errors: [expect.objectContaining({ instancePath: '' })],
    })
  })

  it('allows ordinary union types without coercion', () => {
    const schema = { type: ['string', 'number', 'null'] }
    for (const value of ['hello', 1, null])
      expect(validate(schema, value)).toMatchObject({ ok: true, valid: true })
    expect(validate(schema, false)).toMatchObject({ ok: true, valid: false })
  })

  it('resolves internal escaped $defs references', () => {
    const schema = {
      $defs: { 'positive/~': { type: 'integer', minimum: 1 } },
      properties: { count: { $ref: '#/$defs/positive~1~0' } },
    }
    expect(validate(schema, { count: 3 }, '2020-12')).toMatchObject({ ok: true, valid: true })
    expect(validate(schema, { count: 0 }, '2020-12').errors).toEqual([
      expect.objectContaining({ instancePath: '/count', keyword: 'minimum' }),
    ])
  })

  it('resolves recursive local definitions without fetching', () => {
    const schema = {
      definitions: {
        node: {
          type: 'object',
          properties: { value: { type: 'integer' }, child: { $ref: '#/definitions/node' } },
        },
      },
      $ref: '#/definitions/node',
    }
    expect(validate(schema, { value: 1, child: { value: 2 } })).toMatchObject({
      ok: true,
      valid: true,
    })
    expect(validate(schema, { child: { value: 'bad' } }).errors[0]).toMatchObject({
      instancePath: '/child/value',
      keyword: 'type',
    })
  })

  it.each([
    ['draft-07', 'draft-07'],
    ['2019-09', 'draft/2019-09'],
    ['2020-12', 'draft/2020-12'],
  ] as const)('detects %s across supported URI spellings', (draft, path) => {
    for (const protocol of ['http', 'https']) {
      for (const suffix of ['', '#']) {
        expect(
          validate(
            { $schema: `${protocol}://json-schema.org/${path}/schema${suffix}`, type: 'null' },
            null,
          ),
        ).toMatchObject({ ok: true, valid: true, draft })
      }
    }
  })

  it('allows an explicitly selected matching declared dialect', () => {
    expect(
      validate({ $schema: 'https://json-schema.org/draft/2020-12/schema' }, null, '2020-12'),
    ).toMatchObject({ ok: true, valid: true, draft: '2020-12' })
  })

  it.each([
    'http://json-schema.org/draft-04/schema#',
    'https://example.com/custom-schema',
    'https://json-schema.org/draft/2020-12/schema#fragment',
    2020,
    null,
  ])('rejects unsupported or malformed metaschemas: %j', ($schema) => {
    expect(validate({ $schema }, {})).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('Unsupported $schema'),
    })
  })

  it('rejects a dialect selection that contradicts $schema', () => {
    expect(
      validate({ $schema: 'https://json-schema.org/draft/2020-12/schema' }, {}, '2019-09'),
    ).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringMatching(/2019-09.*2020-12/),
    })
  })

  it('distinguishes malformed schema JSON, malformed instance JSON, and invalid schemas', () => {
    expect(validateJsonSchema('{"type":', '{}', 'auto')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('not valid JSON'),
      errors: [],
    })
    expect(validateJsonSchema('{}', '{"value":', 'auto')).toMatchObject({
      ok: false,
      source: 'instance',
      message: expect.stringContaining('not valid JSON'),
      errors: [],
    })
    const result = validate({ type: 'not-a-type' }, {})
    expect(result).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('schema is invalid'),
    })
    expect(result.errors.some((error) => error.instancePath === '/type')).toBe(true)
  })

  it.each([null, [], 1, 'object'].map((schema) => [schema]))(
    'rejects non-schema JSON: %j',
    (schema) => {
      expect(validate(schema, null)).toMatchObject({
        ok: false,
        source: 'schema',
        message: expect.stringContaining('object or a boolean'),
      })
    },
  )

  it('does not treat empty editors as valid placeholder schemas or documents', () => {
    expect(validateJsonSchema('', '{}', 'auto')).toMatchObject({ ok: false, source: 'schema' })
    expect(validateJsonSchema('{}', '', 'auto')).toMatchObject({ ok: false, source: 'instance' })
  })

  it.each([
    ['email', 'ada@example.com', 'not an email'],
    ['date-time', '2026-10-06T12:30:00Z', '2026-99-06T12:30:00Z'],
    ['uuid', '550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid'],
  ])('validates standard %s formats', (format, good, bad) => {
    expect(validate({ type: 'string', format }, good)).toMatchObject({ ok: true, valid: true })
    expect(validate({ type: 'string', format }, bad).errors).toEqual([
      expect.objectContaining({ instancePath: '', keyword: 'format', schemaPath: '#/format' }),
    ])
  })

  it('rejects unknown formats and misspelled validation keywords', () => {
    expect(validate({ type: 'string', format: 'made-up-format' }, 'hello')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('made-up-format'),
    })
    expect(validate({ type: 'string', minLenght: 3 }, 'x')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('minLenght'),
    })
  })

  it('rejects asynchronous schemas before executing the async validator', () => {
    expect(validate({ $async: true, type: 'integer' }, 'bad')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('Asynchronous schemas'),
    })
  })

  it('does not insert defaults, coerce types, or remove additional properties', () => {
    const schema = {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'integer', default: 1 } },
      additionalProperties: false,
    }
    expect(validate(schema, {}).errors).toEqual([
      expect.objectContaining({ instancePath: '/count', keyword: 'required' }),
    ])
    expect(validate(schema, { count: '1' }).errors).toEqual([
      expect.objectContaining({ instancePath: '/count', keyword: 'type' }),
    ])
    expect(validate(schema, { count: 1, extra: true }).errors).toEqual([
      expect.objectContaining({ instancePath: '/extra', keyword: 'additionalProperties' }),
    ])
  })

  it('preserves object uniqueness checks', () => {
    expect(
      validate({ type: 'array', items: { type: 'object' }, uniqueItems: true }, [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ]),
    ).toMatchObject({
      ok: true,
      valid: false,
      errors: [expect.objectContaining({ keyword: 'uniqueItems' })],
    })
  })

  it('rejects non-finite parsed numbers instead of treating them as JSON Schema numbers', () => {
    expect(validateJsonSchema('{"type":"number"}', '1e400', 'auto')).toMatchObject({
      ok: true,
      valid: false,
      errors: [expect.objectContaining({ keyword: 'type' })],
    })
    expect(validateJsonSchema('{"type":"integer"}', '-1e400', 'auto')).toMatchObject({
      ok: true,
      valid: false,
    })
  })

  it('reports unresolved external references without making a network request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      expect(validate({ $ref: 'https://example.com/private-schema.json' }, {})).toMatchObject({
        ok: false,
        source: 'schema',
        message: expect.stringMatching(/local-only.*not downloaded.*\$defs/),
      })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gives useful errors for missing local references and invalid regular expressions', () => {
    expect(validate({ $ref: '#/$defs/missing' }, {})).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('Cannot resolve reference'),
    })
    expect(validate({ pattern: '[' }, 'text')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringMatching(/regular expression|regex/i),
    })
  })

  it('limits displayed errors while retaining the complete failure count', () => {
    const required = Array.from({ length: 150 }, (_, index) => `field${index}`)
    const result = validate({ type: 'object', required }, {})
    expect(result).toMatchObject({ ok: true, valid: false, totalErrors: 150 })
    expect(result.errors).toHaveLength(100)
    expect(result.errors[99].instancePath).toBe('/field99')
  })

  it('enforces exact UTF-8 byte limits independently for both inputs', () => {
    const exactInstance = `"${'a'.repeat(MAX_INPUT_BYTES - 2)}"`
    expect(validateJsonSchema('true', exactInstance, 'auto')).toMatchObject({
      ok: true,
      valid: true,
    })
    expect(validateJsonSchema('true', ` ${exactInstance}`, 'auto')).toMatchObject({
      ok: false,
      source: 'instance',
      message: expect.stringContaining('2 MiB'),
    })
    const multibyteInstance = `"${'é'.repeat(MAX_INPUT_BYTES / 2)}"`
    expect(validateJsonSchema('true', multibyteInstance, 'auto')).toMatchObject({
      ok: false,
      source: 'instance',
    })
    const exactSchema = `true${' '.repeat(MAX_INPUT_BYTES - 4)}`
    expect(validateJsonSchema(exactSchema, 'null', 'auto')).toMatchObject({ ok: true, valid: true })
    expect(validateJsonSchema(`${exactSchema} `, 'null', 'auto')).toMatchObject({
      ok: false,
      source: 'schema',
      message: expect.stringContaining('2 MiB'),
    })
  })

  it('does not reuse schemas with the same $id across consecutive validations', () => {
    const $id = 'https://example.com/my-schema'
    expect(validate({ $id, type: 'integer' }, 1)).toMatchObject({ ok: true, valid: true })
    expect(validate({ $id, type: 'string' }, 1)).toMatchObject({ ok: true, valid: false })
    expect(validate({ $id, type: 'string' }, 'hello')).toMatchObject({ ok: true, valid: true })
  })
})
