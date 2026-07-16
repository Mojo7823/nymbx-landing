import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { convertDocx, toHtmlDocument } from './convertDocx'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const CONTENT_TYPES = (overrides: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  ${overrides}
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

/** Assemble a minimal but valid .docx around the given <w:body> content. */
function buildDocx(bodyXml: string, { numbering = false } = {}): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      CONTENT_TYPES(
        numbering
          ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
          : '',
      ),
    ),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${bodyXml}</w:body></w:document>`,
    ),
  }
  if (numbering) {
    files['word/numbering.xml'] = strToU8(NUMBERING)
    files['word/_rels/document.xml.rels'] = strToU8(DOC_RELS)
  }
  const bytes = zipSync(files)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const heading = (level: number, text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`
const para = (runs: string) => `<w:p>${runs}</w:p>`
const cell = (text: string) => `<w:tc>${para(run(text))}</w:tc>`

describe('convertDocx', () => {
  it('maps headings to h1/h2 and atx markdown', async () => {
    const buf = buildDocx(heading(1, 'Top title') + heading(2, 'Section') + para(run('Body.')))
    const res = await convertDocx(buf, 'embed')
    expect(res.html).toContain('<h1>Top title</h1>')
    expect(res.html).toContain('<h2>Section</h2>')
    expect(res.markdown).toContain('# Top title')
    expect(res.markdown).toContain('## Section')
    expect(res.markdown).toContain('Body.')
  })

  it('maps bold and italic runs', async () => {
    const buf = buildDocx(para(run('bold', '<w:b/>') + run(' and ') + run('italic', '<w:i/>')))
    const res = await convertDocx(buf, 'embed')
    expect(res.html).toContain('<strong>bold</strong>')
    expect(res.html).toContain('<em>italic</em>')
    expect(res.markdown).toContain('**bold**')
    expect(res.markdown).toContain('_italic_')
  })

  it('maps bullet lists', async () => {
    const li = (text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`
    const buf = buildDocx(li('first') + li('second'), { numbering: true })
    const res = await convertDocx(buf, 'embed')
    expect(res.html).toContain('<ul>')
    expect(res.html).toContain('<li>first</li>')
    // turndown pads list markers to four columns ("-   item").
    expect(res.markdown).toMatch(/^- {3}first$/m)
    expect(res.markdown).toMatch(/^- {3}second$/m)
  })

  it('converts tables to GFM with the first row promoted to header', async () => {
    const row = (a: string, b: string) => `<w:tr>${cell(a)}${cell(b)}</w:tr>`
    const buf = buildDocx(`<w:tbl>${row('Name', 'Size')}${row('a.txt', '1 KB')}</w:tbl>`)
    const res = await convertDocx(buf, 'embed')
    // HTML stays faithful to mammoth's output (no fabricated header row)…
    expect(res.html).toContain('<td>')
    expect(res.html).not.toContain('<th>')
    // …while markdown gets a valid pipe table.
    expect(res.markdown).toContain('| Name | Size |')
    expect(res.markdown).toContain('| --- | --- |')
    expect(res.markdown).toContain('| a.txt | 1 KB |')
  })

  it('surfaces mammoth warnings for unrecognised styles', async () => {
    const buf = buildDocx(
      `<w:p><w:pPr><w:pStyle w:val="FancyCustom"/></w:pPr>${run('styled')}</w:p>`,
    )
    const res = await convertDocx(buf, 'embed')
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.warnings.join(' ')).toMatch(/style/i)
  })

  it('rejects cleanly on a corrupt file', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
    await expect(convertDocx(garbage, 'embed')).rejects.toThrow()
  })

  it('produces an empty result for an empty document body', async () => {
    const res = await convertDocx(buildDocx(''), 'embed')
    expect(res.html).toBe('')
    expect(res.markdown).toBe('')
    expect(res.images).toEqual([])
  })
})

describe('toHtmlDocument', () => {
  it('wraps the fragment and escapes the title', () => {
    const doc = toHtmlDocument('<p>hi</p>', 'a <b> & c')
    expect(doc).toContain('<title>a &lt;b&gt; &amp; c</title>')
    expect(doc).toContain('<p>hi</p>')
    expect(doc.startsWith('<!doctype html>')).toBe(true)
  })
})
