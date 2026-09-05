/**
 * XMP packets are plain XML, so the browser's own `DOMParser` reads them and
 * the tool never has to ship pdf.js (~1 MB) for a text view. `parseXmp` needs
 * a DOM and therefore runs on the main thread; `buildXmp` is pure string work
 * and is called from the worker as well.
 */

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

/** Prefixes XMP tooling uses for the namespaces that turn up in real files. */
const WELL_KNOWN_PREFIXES: Record<string, string> = {
  'http://purl.org/dc/elements/1.1/': 'dc',
  'http://ns.adobe.com/xap/1.0/': 'xmp',
  'http://ns.adobe.com/pdf/1.3/': 'pdf',
  'http://ns.adobe.com/xap/1.0/mm/': 'xmpMM',
  'http://www.aiim.org/pdfa/ns/id/': 'pdfaid',
  'http://ns.adobe.com/photoshop/1.0/': 'photoshop',
}

export interface XmpProperty {
  name: string
  value: string
}

export interface ParsedXmp {
  properties: XmpProperty[]
  error?: string
}

function qualifiedName(namespaceURI: string | null, prefix: string | null, localName: string) {
  const known = namespaceURI ? WELL_KNOWN_PREFIXES[namespaceURI] : undefined
  const used = known ?? prefix ?? ''
  return used ? `${used}:${localName}` : localName
}

/** Text of an `rdf:Alt` / `rdf:Seq` / `rdf:Bag` container, or null when absent. */
function containerValue(element: Element): string | null {
  for (const child of Array.from(element.children)) {
    if (child.namespaceURI !== RDF_NS) continue
    if (child.localName !== 'Alt' && child.localName !== 'Seq' && child.localName !== 'Bag') {
      continue
    }
    const items = Array.from(child.children)
      .filter((li) => li.namespaceURI === RDF_NS && li.localName === 'li')
      .map((li) => (li.textContent ?? '').trim())
    if (items.length === 0) return ''
    // rdf:Alt is a set of alternatives (one per language) — show the first.
    return child.localName === 'Alt' ? items[0] : items.join('; ')
  }
  return null
}

/**
 * Read every property of every `rdf:Description`, in both element and
 * attribute form. A malformed packet still reports its raw text, with `error`
 * set so the UI can say so.
 */
export function parseXmp(xml: string): ParsedXmp {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { properties: [], error: 'The XMP packet is not well-formed XML' }
  }
  const properties: XmpProperty[] = []
  const descriptions = doc.getElementsByTagNameNS(RDF_NS, 'Description')
  for (const description of Array.from(descriptions)) {
    for (const attribute of Array.from(description.attributes)) {
      const ns = attribute.namespaceURI
      if (ns === XMLNS_NS || ns === RDF_NS || ns === XML_NS) continue
      if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue
      properties.push({
        name: qualifiedName(ns, attribute.prefix, attribute.localName),
        value: attribute.value,
      })
    }
    for (const child of Array.from(description.children)) {
      const container = containerValue(child)
      properties.push({
        name: qualifiedName(child.namespaceURI, child.prefix, child.localName),
        value: container ?? (child.textContent ?? '').trim(),
      })
    }
  }
  return { properties }
}

/** XML-escape a text value. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface XmpFields {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  producer?: string
  creatorTool?: string
  /** ISO 8601, e.g. `2024-03-05T02:15:30Z`. */
  createDate?: string
  modifyDate?: string
}

/**
 * Build a minimal packet from the Info fields the user ended up with.
 *
 * Deliberately writes nothing the user did not enter: no `x:xmptk` toolkit
 * name, no `xmp:MetadataDate`, no `xmpMM` identifiers. Returns `null` when
 * every field is empty — the caller then removes the packet instead.
 */
export function buildXmp(fields: XmpFields): string | null {
  const value = (v?: string) => (v && v.trim() ? escapeXml(v) : null)
  const title = value(fields.title)
  const author = value(fields.author)
  const subject = value(fields.subject)
  const keywords = value(fields.keywords)
  const producer = value(fields.producer)
  const creatorTool = value(fields.creatorTool)
  const createDate = value(fields.createDate)
  const modifyDate = value(fields.modifyDate)

  const lines: string[] = []
  if (title) {
    lines.push(
      `   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>`,
    )
  }
  if (author)
    lines.push(`   <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>`)
  if (subject) {
    lines.push(
      `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description>`,
    )
  }
  if (keywords) lines.push(`   <pdf:Keywords>${keywords}</pdf:Keywords>`)
  if (producer) lines.push(`   <pdf:Producer>${producer}</pdf:Producer>`)
  if (creatorTool) lines.push(`   <xmp:CreatorTool>${creatorTool}</xmp:CreatorTool>`)
  if (createDate) lines.push(`   <xmp:CreateDate>${createDate}</xmp:CreateDate>`)
  if (modifyDate) lines.push(`   <xmp:ModifyDate>${modifyDate}</xmp:ModifyDate>`)
  if (lines.length === 0) return null

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="${RDF_NS}">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
${lines.join('\n')}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}
