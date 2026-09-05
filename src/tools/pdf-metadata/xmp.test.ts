import { describe, expect, it } from 'vitest'
import { buildXmp, escapeXml, parseXmp } from './xmp'

const PACKET = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Fixture 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Quarterly Compliance Report</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>Alice Example</rdf:li><rdf:li>Bob Example</rdf:li></rdf:Seq></dc:creator>
   <pdf:Keywords>compliance, audit, 2025</pdf:Keywords>
   <xmpMM:DocumentID>uuid:11111111-2222-3333-4444-555555555555</xmpMM:DocumentID>
   <photoshop:AuthorsPosition>Compliance Lead</photoshop:AuthorsPosition>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

function valueOf(xml: string, name: string) {
  return parseXmp(xml).properties.find((property) => property.name === name)?.value
}

describe('parseXmp', () => {
  it('reads element properties with the well-known prefixes', () => {
    const { properties, error } = parseXmp(PACKET)
    expect(error).toBeUndefined()
    expect(properties.find((p) => p.name === 'dc:title')?.value).toBe('Quarterly Compliance Report')
    expect(properties.find((p) => p.name === 'pdf:Keywords')?.value).toBe('compliance, audit, 2025')
    expect(properties.find((p) => p.name === 'xmpMM:DocumentID')?.value).toBe(
      'uuid:11111111-2222-3333-4444-555555555555',
    )
    expect(properties.find((p) => p.name === 'photoshop:AuthorsPosition')?.value).toBe(
      'Compliance Lead',
    )
  })

  it('joins rdf:Seq items and takes the first rdf:Alt alternative', () => {
    expect(valueOf(PACKET, 'dc:creator')).toBe('Alice Example; Bob Example')
  })

  it('reads attribute-form properties, skipping xmlns and rdf attributes', () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><rdf:Description rdf:about="" pdf:Producer="Acme PDF Engine 9.1"/></rdf:RDF>`
    const { properties } = parseXmp(xml)
    expect(properties).toEqual([{ name: 'pdf:Producer', value: 'Acme PDF Engine 9.1' }])
  })

  it('falls back to the document prefix for unknown namespaces', () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:acme="http://acme.example/ns/"><rdf:Description rdf:about=""><acme:Region>EU</acme:Region></rdf:Description></rdf:RDF>`
    expect(valueOf(xml, 'acme:Region')).toBe('EU')
  })

  it('reports malformed XML instead of throwing', () => {
    const { properties, error } = parseXmp('<rdf:RDF><unclosed>')
    expect(properties).toEqual([])
    expect(error).toBe('The XMP packet is not well-formed XML')
  })
})

describe('buildXmp', () => {
  it('writes only the fields that were given, and nothing else', () => {
    const xml = buildXmp({ title: 'Edited 標題 ✓', keywords: 'a, b; c' })!
    expect(xml).toContain('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Edited 標題 ✓')
    expect(xml).toContain('<pdf:Keywords>a, b; c</pdf:Keywords>')
    expect(xml).not.toContain('dc:creator')
    expect(xml).not.toContain('x:xmptk')
    expect(xml).not.toContain('MetadataDate')
    expect(xml).not.toContain('xmpMM')
  })

  it('round-trips through parseXmp', () => {
    const xml = buildXmp({
      title: 'Report',
      author: 'Alice Example',
      subject: 'Internal',
      keywords: 'a, b',
      producer: 'Acme',
      creatorTool: 'Word 365',
      createDate: '2024-03-05T02:15:30Z',
      modifyDate: '2025-01-20T09:00:00Z',
    })!
    const { properties, error } = parseXmp(xml)
    expect(error).toBeUndefined()
    expect(Object.fromEntries(properties.map((p) => [p.name, p.value]))).toEqual({
      'dc:title': 'Report',
      'dc:creator': 'Alice Example',
      'dc:description': 'Internal',
      'pdf:Keywords': 'a, b',
      'pdf:Producer': 'Acme',
      'xmp:CreatorTool': 'Word 365',
      'xmp:CreateDate': '2024-03-05T02:15:30Z',
      'xmp:ModifyDate': '2025-01-20T09:00:00Z',
    })
  })

  it('escapes XML metacharacters', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;')
    const xml = buildXmp({ title: 'Tom & "Jerry" <draft>' })!
    expect(xml).toContain('Tom &amp; &quot;Jerry&quot; &lt;draft&gt;')
    expect(parseXmp(xml).properties[0].value).toBe('Tom & "Jerry" <draft>')
  })

  it('returns null when every field is empty', () => {
    expect(buildXmp({})).toBeNull()
    expect(buildXmp({ title: '   ', author: '' })).toBeNull()
  })
})
