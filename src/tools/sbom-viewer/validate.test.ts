import { describe, expect, it } from 'vitest'
import { formatReport } from './report'
import {
  findDuplicateObjects,
  relaxObjectUniqueness,
  schemaFor,
  validateDocument,
} from './validate'

const validCdx16 = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: 'urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79',
  version: 1,
  metadata: {
    timestamp: '2026-01-02T03:04:05Z',
    tools: { components: [{ type: 'application', name: 'cdxgen', version: '10.0.0' }] },
    component: { 'bom-ref': 'root', type: 'application', name: 'demo-app', version: '1.0.0' },
  },
  components: [
    {
      'bom-ref': 'pkg:npm/left-pad@1.3.0',
      type: 'library',
      name: 'left-pad',
      version: '1.3.0',
      licenses: [{ license: { id: 'MIT' } }],
      purl: 'pkg:npm/left-pad@1.3.0',
      hashes: [
        {
          alg: 'SHA-256',
          content: '0000000000000000000000000000000000000000000000000000000000000000',
        },
      ],
    },
  ],
  dependencies: [{ ref: 'root', dependsOn: ['pkg:npm/left-pad@1.3.0'] }],
}

// Mirrors the synthetic invalid fixture used for the browser smoke test.
const invalidCdx16 = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: 'not-a-urn',
  version: '1',
  metadata: { timestamp: 'yesterday', tools: 'cdxgen' },
  components: [
    { type: 'librar', name: 'left-pad', version: 1.0 },
    { type: 'library', version: '2.0' },
    {
      type: 'library',
      name: 'ok',
      hashes: [{ alg: 'SHA-256', content: 'zz' }],
      licenses: [{ license: { id: 'Not-A-License' } }],
    },
  ],
  dependencies: [{ ref: 'x', dependsOn: 'y' }],
}

const validSpdx23 = {
  SPDXID: 'SPDXRef-DOCUMENT',
  spdxVersion: 'SPDX-2.3',
  name: 'example',
  dataLicense: 'CC0-1.0',
  documentNamespace: 'http://spdx.org/documents/example-0.0.1',
  documentDescribes: ['SPDXRef-example'],
  creationInfo: { created: '2022-10-23T15:44:16Z', creators: ['Tool: spdx-maven-plugin'] },
  packages: [
    {
      SPDXID: 'SPDXRef-example',
      name: 'example',
      versionInfo: '0.0.1',
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'Apache-2.0',
      licenseDeclared: 'Apache-2.0',
      copyrightText: 'NOASSERTION',
    },
  ],
}

describe('schemaFor', () => {
  it('maps CycloneDX 1.2–1.6 to their own schema', () => {
    expect(schemaFor('CycloneDX', '1.2')).toEqual({ id: 'bom-1.2', label: 'CycloneDX 1.2' })
    expect(schemaFor('CycloneDX', '1.6')).toEqual({ id: 'bom-1.6', label: 'CycloneDX 1.6' })
  })

  it('maps SPDX 2.2 and 2.3 to the 2.3 schema', () => {
    expect(schemaFor('SPDX', '2.3')).toEqual({ id: 'spdx-2.3', label: 'SPDX 2.3' })
    expect(schemaFor('SPDX', 'SPDX-2.2')).toEqual({ id: 'spdx-2.3', label: 'SPDX 2.3' })
  })

  it('returns null for versions with no bundled schema', () => {
    expect(schemaFor('CycloneDX', '1.1')).toBeNull()
    expect(schemaFor('CycloneDX', '')).toBeNull()
    expect(schemaFor('SPDX', '3.0')).toBeNull()
  })
})

describe('validateDocument', () => {
  it('accepts a valid CycloneDX 1.6 document', async () => {
    const result = await validateDocument(validCdx16, 'CycloneDX', '1.6')
    expect(result).toMatchObject({ schema: 'CycloneDX 1.6', valid: true, totalErrors: 0 })
    expect(result.errors).toEqual([])
  })

  it('accepts a valid SPDX 2.3 document', async () => {
    const result = await validateDocument(validSpdx23, 'SPDX', 'SPDX-2.3')
    expect(result).toMatchObject({ schema: 'SPDX 2.3', valid: true, totalErrors: 0 })
  })

  it('reports precise JSON pointers for an invalid document', async () => {
    const result = await validateDocument(invalidCdx16, 'CycloneDX', '1.6')
    expect(result.valid).toBe(false)
    expect(result.totalErrors).toBeGreaterThan(0)
    const paths = result.errors.map((e) => e.path)
    expect(paths).toContain('/components/0/type')
    expect(paths).toContain('/components/0/version')
    expect(paths).toContain('/components/1')
    expect(paths).toContain('/components/2/hashes/0/content')
    expect(paths).toContain('/dependencies/0/dependsOn')
    expect(paths).toContain('/metadata/timestamp')
    expect(paths).toContain('/metadata/tools')

    const typeError = result.errors.find((e) => e.path === '/components/0/type')
    expect(typeError?.message).toContain('must be equal to one of the allowed values')
    expect(typeError?.keyword).toBe('enum')
    const missingName = result.errors.find(
      (e) => e.path === '/components/1' && e.keyword === 'required',
    )
    expect(missingName?.message).toContain("must have required property 'name'")
  })

  it('validates a 1.2 document against the 1.2 schema', async () => {
    const result = await validateDocument(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.2',
        version: 1,
        components: [{ type: 'library', name: 'a', version: '1.0.0' }],
      },
      'CycloneDX',
      '1.2',
    )
    expect(result).toMatchObject({ schema: 'CycloneDX 1.2', valid: true })
  })

  it('skips validation when no schema is bundled', async () => {
    const result = await validateDocument({}, 'CycloneDX', '1.1')
    expect(result).toMatchObject({ schema: null, valid: null, totalErrors: 0 })
    expect(result.note).toContain('no bundled schema for CycloneDX 1.1')
  })
})

describe('formatReport', () => {
  it('summarizes a valid result', () => {
    expect(formatReport({ schema: 'CycloneDX 1.6', valid: true, errors: [], totalErrors: 0 })).toBe(
      'Valid against the CycloneDX 1.6 schema',
    )
  })

  it('lists path — message [keyword] lines and the truncation notice', () => {
    const report = formatReport({
      schema: 'CycloneDX 1.6',
      valid: false,
      errors: [{ path: '/components/0/type', message: 'must be one of', keyword: 'enum' }],
      totalErrors: 3,
    })
    expect(report.split('\n')).toEqual([
      '3 schema errors against the CycloneDX 1.6 schema',
      '/components/0/type — must be one of [enum]',
      '… 2 more not shown',
    ])
  })

  it('explains an unvalidated document', () => {
    expect(
      formatReport({
        schema: null,
        valid: null,
        errors: [],
        totalErrors: 0,
        note: 'XML is parsed but not schema-validated',
      }),
    ).toBe('Not validated — XML is parsed but not schema-validated')
  })
})

describe('object-array uniqueness', () => {
  it('relaxes uniqueItems only where the items are objects', () => {
    const schema = {
      type: 'object',
      definitions: {
        ref: { type: 'string' },
        comp: { type: 'object', properties: { name: { type: 'string' } } },
      },
      properties: {
        components: { type: 'array', uniqueItems: true, items: { $ref: '#/definitions/comp' } },
        dependsOn: { type: 'array', uniqueItems: true, items: { $ref: '#/definitions/ref' } },
        tags: { type: 'array', uniqueItems: true, items: { type: 'string' } },
      },
    }
    const relaxed = relaxObjectUniqueness(schema) as typeof schema
    expect(relaxed.properties.components.uniqueItems).toBeUndefined()
    expect(relaxed.properties.dependsOn.uniqueItems).toBe(true)
    expect(relaxed.properties.tags.uniqueItems).toBe(true)
    // The input is left untouched.
    expect(schema.properties.components.uniqueItems).toBe(true)
  })

  it('reports duplicate components (top-level and nested) the way Ajv would', () => {
    const a = { type: 'library', name: 'a', version: '1' }
    const doc = {
      components: [
        a,
        { type: 'library', name: 'b', components: [a, { ...a }] },
        { version: '1', name: 'a', type: 'library' },
      ],
      dependencies: [
        { ref: 'x', dependsOn: [] },
        { ref: 'x', dependsOn: [] },
      ],
    }
    const errors = findDuplicateObjects(doc)
    expect(errors.map((e) => [e.instancePath, e.keyword])).toEqual([
      ['/components', 'uniqueItems'],
      ['/components/1/components', 'uniqueItems'],
      ['/dependencies', 'uniqueItems'],
    ])
    expect(errors[0]!.message).toBe(
      'must NOT have duplicate items (items ## 2 and 0 are identical)',
    )
  })

  it('still flags a duplicate dependsOn entry and a duplicate component through validateDocument', async () => {
    const withDuplicates = {
      ...validCdx16,
      components: [...validCdx16.components, { ...validCdx16.components[0] }],
      dependencies: [
        { ref: 'root', dependsOn: ['pkg:npm/left-pad@1.3.0', 'pkg:npm/left-pad@1.3.0'] },
      ],
    }
    const result = await validateDocument(withDuplicates, 'CycloneDX', '1.6')
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.path).sort()).toEqual([
      '/components',
      '/dependencies/0/dependsOn',
    ])
  })

  it('validates a 10 000-component document in linear time', async () => {
    const components = Array.from({ length: 10_000 }, (_, i) => ({
      type: 'library',
      'bom-ref': `pkg:npm/p${i}@1.0.0`,
      name: `p${i}`,
      version: '1.0.0',
      purl: `pkg:npm/p${i}@1.0.0`,
    }))
    const dependencies = components.map((c, i) => ({
      ref: c['bom-ref'],
      dependsOn: i > 0 ? [`pkg:npm/p${i - 1}@1.0.0`] : [],
    }))
    const big = { ...validCdx16, components, dependencies }
    const started = performance.now()
    const result = await validateDocument(big, 'CycloneDX', '1.6')
    const elapsed = performance.now() - started
    expect(result.valid).toBe(true)
    // Was 11 s with Ajv's pairwise uniqueItems; generous bound to stay unflaky.
    expect(elapsed).toBeLessThan(5_000)
  }, 30_000)
})
