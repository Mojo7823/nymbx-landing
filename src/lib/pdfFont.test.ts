import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as fontkit from 'fontkit'
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { embedSubsetFont } from './pdfFont'

// The same Noto Sans TC the tools self-host under public/fonts (copied from
// this package by scripts/copy-model-assets.mjs); read from node_modules so
// the test runs after a fresh `npm ci` too.
const FONT = join(
  process.cwd(),
  'node_modules/@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf',
)
const TEXT = '簽名：王小明 2026-09-05'

async function embeddedFontProgram(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf)
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.has(PDFName.of('FontFile2'))) {
      const stream = doc.context.lookup(obj.get(PDFName.of('FontFile2')))
      if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode()
    }
  }
  throw new Error('no embedded TrueType program found')
}

describe('embedSubsetFont', () => {
  it('keeps an outline for every glyph the text uses (regression: @pdf-lib/fontkit lost half of them)', async () => {
    const doc = await PDFDocument.create()
    const font = await embedSubsetFont(doc, new Uint8Array(readFileSync(FONT)))
    doc.addPage([400, 200]).drawText(TEXT, { x: 20, y: 90, size: 28, font })
    const pdf = await doc.save()

    // Subsetting actually happened: the full font is ~4.4 MB.
    expect(pdf.byteLength).toBeLessThan(200_000)

    const program = fontkit.create(new Uint8Array(await embeddedFontProgram(pdf)))
    const uniqueChars = new Set(Array.from(TEXT.replace(/\s/g, ''))).size
    expect(program.numGlyphs).toBeGreaterThanOrEqual(uniqueChars)

    let empty = 0
    for (let gid = 1; gid < program.numGlyphs; gid++) {
      const glyph = program.getGlyph(gid)
      if (glyph.path.commands.length === 0) empty++
    }
    // Only the space may be blank.
    expect(empty).toBeLessThanOrEqual(1)
  }, 30_000)
})
