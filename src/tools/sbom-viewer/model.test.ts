import { describe, expect, it } from 'vitest'
import {
  componentsToCsv,
  dependencyTree,
  filterSort,
  licenseSummary,
  normalizeCycloneDx,
  normalizeCycloneDxXml,
  normalizeSpdx,
  severityRank,
  unresolvedRefs,
  NO_LICENSE,
  type SbomComponent,
} from './model'

const cdx16 = {
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
      group: '',
      name: 'left-pad',
      version: '1.3.0',
      supplier: { name: 'Azer' },
      licenses: [{ license: { id: 'MIT' } }],
      purl: 'pkg:npm/left-pad@1.3.0',
      cpe: 'cpe:2.3:a:azer:left-pad:1.3.0:*:*:*:*:*:*:*',
      hashes: [{ alg: 'SHA-256', content: 'abc123' }],
      description: 'String padding',
      components: [
        {
          'bom-ref': 'pkg:npm/nested@0.1.0',
          type: 'library',
          name: 'nested',
          version: '0.1.0',
          licenses: [{ license: { name: 'Custom EULA' } }],
        },
      ],
    },
    {
      'bom-ref': 'pkg:npm/rx@7.0.0',
      type: 'framework',
      group: '@scope',
      name: 'rx',
      version: '7.0.0',
      publisher: 'Reactive',
      licenses: [{ expression: 'Apache-2.0 OR MIT' }],
      purl: 'pkg:npm/%40scope/rx@7.0.0',
    },
    { 'bom-ref': 'pkg:npm/bare@2.0.0', type: 'library', name: 'bare', version: '2.0.0' },
  ],
  dependencies: [
    { ref: 'root', dependsOn: ['pkg:npm/left-pad@1.3.0', 'pkg:npm/rx@7.0.0'] },
    { ref: 'pkg:npm/left-pad@1.3.0', dependsOn: ['pkg:npm/rx@7.0.0', 'pkg:npm/ghost@9.9.9'] },
    // Cycle: rx depends back on left-pad.
    { ref: 'pkg:npm/rx@7.0.0', dependsOn: ['pkg:npm/left-pad@1.3.0'] },
  ],
  vulnerabilities: [
    {
      id: 'CVE-2020-0001',
      source: { name: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2020-0001' },
      ratings: [{ severity: 'high', score: 7.5 }],
      affects: [{ ref: 'pkg:npm/left-pad@1.3.0' }],
      description: 'Padding overflow',
    },
    {
      id: 'GHSA-xxxx',
      source: { name: 'GitHub' },
      ratings: [],
      affects: [{ ref: 'pkg:npm/rx@7.0.0' }],
      description: 'Unrated',
    },
  ],
}

const cdx14Xml = `<?xml version="1.0" encoding="utf-8"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.4" serialNumber="urn:uuid:0000" version="1">
  <metadata>
    <timestamp>2026-02-03T00:00:00Z</timestamp>
    <tools><tool><vendor>CycloneDX</vendor><name>Node.js module</name><version>2.0.0</version></tool></tools>
    <component type="application" bom-ref="app"><name>xml-app</name><version>0.9.0</version></component>
  </metadata>
  <components>
    <component type="library" bom-ref="pkg:npm/body-parser@1.19.0">
      <publisher>Express</publisher>
      <name>body-parser</name>
      <version>1.19.0</version>
      <description>Body parsing middleware</description>
      <hashes><hash alg="SHA-1">96b2709e</hash></hashes>
      <licenses><license><id>MIT</id></license></licenses>
      <purl>pkg:npm/body-parser@1.19.0</purl>
      <components>
        <component type="library" bom-ref="pkg:npm/bytes@3.1.0"><name>bytes</name><version>3.1.0</version></component>
      </components>
    </component>
  </components>
  <dependencies>
    <dependency ref="app"><dependency ref="pkg:npm/body-parser@1.19.0"/></dependency>
    <dependency ref="pkg:npm/body-parser@1.19.0"/>
  </dependencies>
</bom>`

const spdx23 = {
  SPDXID: 'SPDXRef-DOCUMENT',
  spdxVersion: 'SPDX-2.3',
  name: 'examplemaven',
  documentNamespace: 'http://spdx.org/documents/examplemaven-0.0.1',
  documentDescribes: ['SPDXRef-example'],
  creationInfo: {
    created: '2022-10-23T15:44:16Z',
    creators: ["Person: Gary O'Neall", 'Tool: spdx-maven-plugin'],
  },
  packages: [
    {
      SPDXID: 'SPDXRef-example',
      name: 'example',
      versionInfo: '0.0.1',
      licenseConcluded: 'Apache-2.0',
      licenseDeclared: 'Apache-2.0',
      supplier: 'Organization: Source Auditor Inc.',
      checksums: [{ algorithm: 'SHA1', checksumValue: 'b8a7e6c7' }],
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: 'pkg:maven/org.spdx/example@0.0.1',
        },
        {
          referenceCategory: 'SECURITY',
          referenceType: 'cpe23Type',
          referenceLocator: 'cpe:2.3:a:spdx:example:0.0.1:*:*:*:*:*:*:*',
        },
      ],
    },
    {
      SPDXID: 'SPDXRef-junit',
      name: 'JUnit',
      versionInfo: '3.8.1',
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'CPL-1.0',
      originator: 'Organization: JUnit',
    },
    {
      SPDXID: 'SPDXRef-log4j',
      name: 'Apache Log4j API',
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NONE',
    },
  ],
  relationships: [
    {
      spdxElementId: 'SPDXRef-example',
      relatedSpdxElement: 'SPDXRef-junit',
      relationshipType: 'DEPENDS_ON',
    },
    {
      spdxElementId: 'SPDXRef-log4j',
      relatedSpdxElement: 'SPDXRef-example',
      relationshipType: 'DEPENDENCY_OF',
    },
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relatedSpdxElement: 'SPDXRef-example',
      relationshipType: 'DESCRIBES',
    },
  ],
}

describe('normalizeCycloneDx', () => {
  const doc = normalizeCycloneDx(cdx16)

  it('reads the document header', () => {
    expect(doc.format).toBe('CycloneDX')
    expect(doc.specVersion).toBe('1.6')
    expect(doc.serialNumber).toBe('urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79')
    expect(doc.created).toBe('2026-01-02T03:04:05Z')
    expect(doc.tools).toEqual(['cdxgen 10.0.0'])
    expect(doc.subject).toEqual({ ref: 'root', name: 'demo-app', version: '1.0.0' })
  })

  it('flattens nested components', () => {
    expect(doc.components.map((c) => c.name)).toEqual(['left-pad', 'nested', 'rx', 'bare'])
  })

  it('reads licenses as ids, names and expressions', () => {
    expect(doc.components[0].licenses).toEqual(['MIT'])
    expect(doc.components[1].licenses).toEqual(['Custom EULA'])
    expect(doc.components[2].licenses).toEqual(['Apache-2.0 OR MIT'])
    expect(doc.components[3].licenses).toEqual([])
  })

  it('reads hashes, purl, cpe and supplier (falling back to publisher)', () => {
    expect(doc.components[0].hashes).toEqual([{ alg: 'SHA-256', value: 'abc123' }])
    expect(doc.components[0].cpe).toContain('cpe:2.3:a:azer')
    expect(doc.components[0].supplier).toBe('Azer')
    expect(doc.components[2].supplier).toBe('Reactive')
    expect(doc.components[2].group).toBe('@scope')
  })

  it('reads dependencies and vulnerabilities', () => {
    expect(doc.dependencies.get('root')).toEqual(['pkg:npm/left-pad@1.3.0', 'pkg:npm/rx@7.0.0'])
    expect(doc.vulnerabilities).toHaveLength(2)
    expect(doc.vulnerabilities[0]).toMatchObject({
      id: 'CVE-2020-0001',
      source: 'NVD',
      severity: 'high',
      score: 7.5,
      affects: ['pkg:npm/left-pad@1.3.0'],
    })
    expect(doc.vulnerabilities[1].severity).toBe('unknown')
    expect(doc.vulnerabilities[1].score).toBeNull()
  })

  it('warns about unresolved dependency refs', () => {
    expect(unresolvedRefs(doc)).toEqual(['pkg:npm/ghost@9.9.9'])
    expect(doc.warnings).toEqual(['1 dependency ref points to unknown components'])
  })

  it('reads the 1.2–1.4 array form of metadata.tools', () => {
    const legacy = normalizeCycloneDx({
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      metadata: {
        tools: [{ vendor: 'CycloneDX', name: 'cyclonedx-php-composer', version: '1.0' }],
      },
      components: [],
    })
    expect(legacy.tools).toEqual(['CycloneDX cyclonedx-php-composer 1.0'])
  })

  it('survives a structurally invalid document', () => {
    const broken = normalizeCycloneDx({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      metadata: { tools: 'cdxgen' },
      components: [{ type: 'librar', name: 'left-pad', version: 1.0 }, 'nope'],
      dependencies: [{ ref: 'x', dependsOn: 'y' }],
    })
    expect(broken.components).toHaveLength(2)
    expect(broken.components[0].version).toBe('1')
    expect(broken.components[1].name).toBe('')
    expect(broken.dependencies.get('x')).toEqual([])
    expect(broken.tools).toEqual([])
  })
})

describe('normalizeCycloneDxXml', () => {
  const doc = normalizeCycloneDxXml(new DOMParser().parseFromString(cdx14Xml, 'application/xml'))

  it('reads the spec version from the namespace', () => {
    expect(doc.specVersion).toBe('1.4')
    expect(doc.serialNumber).toBe('urn:uuid:0000')
    expect(doc.created).toBe('2026-02-03T00:00:00Z')
    expect(doc.tools).toEqual(['CycloneDX Node.js module 2.0.0'])
  })

  it('excludes metadata.component from the component list', () => {
    expect(doc.subject).toEqual({ ref: 'app', name: 'xml-app', version: '0.9.0' })
    expect(doc.components.map((c) => c.name)).toEqual(['body-parser', 'bytes'])
  })

  it('reads component fields and nested dependencies', () => {
    expect(doc.components[0]).toMatchObject({
      type: 'library',
      version: '1.19.0',
      supplier: 'Express',
      licenses: ['MIT'],
      purl: 'pkg:npm/body-parser@1.19.0',
      hashes: [{ alg: 'SHA-1', value: '96b2709e' }],
    })
    expect(doc.dependencies.get('app')).toEqual(['pkg:npm/body-parser@1.19.0'])
    expect(doc.dependencies.get('pkg:npm/body-parser@1.19.0')).toEqual([])
  })
})

describe('normalizeSpdx', () => {
  const doc = normalizeSpdx(spdx23)

  it('reads the document header and tools', () => {
    expect(doc.format).toBe('SPDX')
    expect(doc.specVersion).toBe('2.3')
    expect(doc.created).toBe('2022-10-23T15:44:16Z')
    expect(doc.tools).toEqual(['spdx-maven-plugin'])
    expect(doc.subject).toEqual({ ref: 'SPDXRef-example', name: 'example', version: '0.0.1' })
  })

  it('maps packages onto components', () => {
    expect(doc.components).toHaveLength(3)
    expect(doc.components[0]).toMatchObject({
      ref: 'SPDXRef-example',
      name: 'example',
      version: '0.0.1',
      supplier: 'Source Auditor Inc.',
      licenses: ['Apache-2.0'],
      purl: 'pkg:maven/org.spdx/example@0.0.1',
      cpe: 'cpe:2.3:a:spdx:example:0.0.1:*:*:*:*:*:*:*',
      hashes: [{ alg: 'SHA1', value: 'b8a7e6c7' }],
    })
    expect(doc.components[1].licenses).toEqual(['CPL-1.0'])
    expect(doc.components[1].supplier).toBe('JUnit')
    expect(doc.components[2].licenses).toEqual([])
  })

  it('maps DEPENDS_ON forward and DEPENDENCY_OF reversed', () => {
    expect(doc.dependencies.get('SPDXRef-example')).toEqual(['SPDXRef-junit', 'SPDXRef-log4j'])
    expect(doc.dependencies.has('SPDXRef-log4j')).toBe(false)
  })
})

describe('licenseSummary', () => {
  it('counts licenses and components without any', () => {
    const doc = normalizeCycloneDx(cdx16)
    const summary = licenseSummary(doc.components)
    expect(summary.map((e) => [e.license, e.count])).toEqual([
      ['Apache-2.0 OR MIT', 1],
      ['Custom EULA', 1],
      ['MIT', 1],
      [NO_LICENSE, 1],
    ])
    expect(summary.find((e) => e.license === NO_LICENSE)?.components).toEqual(['bare@2.0.0'])
  })
})

describe('dependencyTree', () => {
  const tree = dependencyTree(normalizeCycloneDx(cdx16))

  it('roots at the document subject', () => {
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0].label).toBe('demo-app@1.0.0')
    expect(tree.roots[0].childCount).toBe(2)
  })

  it('resolves children to labels and marks unknown refs', () => {
    const leftPad = tree.roots[0].children[0]
    expect(leftPad.label).toBe('left-pad@1.3.0')
    const ghost = leftPad.children.find((c) => c.ref === 'pkg:npm/ghost@9.9.9')
    expect(ghost?.unknown).toBe(true)
    expect(tree.unresolved).toEqual(['pkg:npm/ghost@9.9.9'])
  })

  it('keeps cycles finite by marking repeated refs', () => {
    const leftPad = tree.roots[0].children[0]
    const rx = leftPad.children[0]
    expect(rx.label).toBe('@scope/rx@7.0.0')
    // rx → left-pad closes the cycle; left-pad is already expanded above.
    expect(rx.children[0].repeated).toBe(true)
    expect(rx.children[0].children).toEqual([])
    expect(tree.nodeCount).toBeLessThan(10)
  })

  it('falls back to components nobody depends on when there is no subject', () => {
    const doc = normalizeCycloneDx({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        { 'bom-ref': 'a', name: 'a', version: '1' },
        { 'bom-ref': 'b', name: 'b', version: '1' },
      ],
      dependencies: [{ ref: 'a', dependsOn: ['b'] }],
    })
    const fallback = dependencyTree(doc)
    expect(fallback.roots.map((r) => r.ref)).toEqual(['a'])
  })
})

describe('componentsToCsv', () => {
  it('writes the documented header and escapes per RFC 4180', () => {
    const components: SbomComponent[] = [
      {
        ref: 'r',
        name: 'thing',
        group: 'acme',
        version: '1.0',
        type: 'library',
        supplier: 'Acme, Inc.',
        licenses: ['MIT', 'Apache-2.0'],
        purl: 'pkg:npm/thing@1.0',
        cpe: '',
        hashes: [{ alg: 'SHA-1', value: 'ff' }],
      },
      {
        ref: null,
        name: 'quo"ted',
        version: '',
        type: '',
        supplier: '',
        licenses: [],
        purl: '',
        cpe: '',
        hashes: [],
      },
    ]
    const csv = componentsToCsv(components)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('name,version,type,supplier,licenses,purl,cpe,hashes')
    expect(lines[1]).toBe(
      'acme/thing,1.0,library,"Acme, Inc.",MIT; Apache-2.0,pkg:npm/thing@1.0,,SHA-1:ff',
    )
    expect(lines[2]).toBe('"quo""ted",,,,,,,')
  })
})

describe('filterSort', () => {
  const doc = normalizeCycloneDx(cdx16)

  it('matches name, purl, licenses and supplier', () => {
    expect(filterSort(doc.components, 'left-pad', null, 'asc').map((c) => c.name)).toEqual([
      'left-pad',
    ])
    expect(filterSort(doc.components, 'apache', null, 'asc').map((c) => c.name)).toEqual(['rx'])
    expect(filterSort(doc.components, 'reactive', null, 'asc').map((c) => c.name)).toEqual(['rx'])
    expect(filterSort(doc.components, '@scope', null, 'asc').map((c) => c.name)).toEqual(['rx'])
  })

  it('sorts by a column in both directions without mutating the input', () => {
    const before = doc.components.map((c) => c.name)
    // Sorted on the displayed name, so rx sorts as "@scope/rx".
    expect(filterSort(doc.components, '', 'name', 'asc').map((c) => c.name)).toEqual([
      'rx',
      'bare',
      'left-pad',
      'nested',
    ])
    expect(filterSort(doc.components, '', 'name', 'desc').map((c) => c.name)).toEqual([
      'nested',
      'left-pad',
      'bare',
      'rx',
    ])
    expect(doc.components.map((c) => c.name)).toEqual(before)
  })

  it('sorts empty values last in both directions', () => {
    const rows = filterSort(doc.components, '', 'supplier', 'desc')
    expect(rows[rows.length - 1].supplier).toBe('')
  })
})

describe('severityRank', () => {
  it('orders severities from critical to unknown', () => {
    expect(severityRank('critical')).toBeLessThan(severityRank('high'))
    expect(severityRank('LOW')).toBeLessThan(severityRank('unknown'))
    expect(severityRank('nonsense')).toBeGreaterThanOrEqual(severityRank('unknown'))
  })
})
