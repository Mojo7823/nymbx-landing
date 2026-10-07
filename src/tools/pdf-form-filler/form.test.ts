import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as fontkit from 'fontkit'
import type { FontkitFont, FontkitGlyph } from 'fontkit'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib'
import type { PDFObject } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { createFormFixture, createNoFormFixture, createXfaFixture } from './fixtures'
import { fillForm, inspectForm } from './form'
import type { FormValue } from './types'

const FONT_PATH = resolve(
  process.cwd(),
  'node_modules/@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf',
)

const initialValues = {
  fullName: 'Alice Example',
  notes: 'First line\nSecond line',
  accountId: 'ACCOUNT-007',
  subscribed: true,
  contact: 'Email',
  country: 'Taiwan',
  languages: ['English', 'Chinese'],
}

async function valuesOf(bytes: Uint8Array) {
  const summary = await inspectForm(bytes)
  return Object.fromEntries(summary.fields.map((field) => [field.name, field.value]))
}

function streamText(stream: PDFRawStream): string {
  return new TextDecoder().decode(decodePDFRawStream(stream).decode())
}

function rawStream(doc: PDFDocument, value: PDFObject | undefined): PDFRawStream {
  const stream = doc.context.lookup(value)
  if (!(stream instanceof PDFRawStream)) throw new Error('Expected a PDF stream')
  return stream
}

function normalAppearance(doc: PDFDocument, name: string): PDFRawStream {
  const widget = doc.getForm().getField(name).acroField.getWidgets()[0]
  const normal = widget.getAppearances()?.normal
  if (!(normal instanceof PDFRawStream)) throw new Error(`Missing appearance for ${name}`)
  return normal
}

function expectDrawnText(stream: PDFRawStream, text: string) {
  const hex = Buffer.from(text, 'latin1').toString('hex')
  expect(streamText(stream).toLowerCase()).toContain(`<${hex}> Tj`.toLowerCase())
}

function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents()
  if (contents instanceof PDFRawStream) return streamText(contents)
  if (!(contents instanceof PDFArray)) return ''
  return contents
    .asArray()
    .map((entry) => streamText(rawStream(doc, entry)))
    .join('\n')
}

function paintedAppearances(doc: PDFDocument): PDFRawStream[] {
  return doc.getPages().flatMap((page, index) => {
    const resources = page.node.Resources()
    const objects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!objects) return []
    const content = pageContent(doc, index)
    return objects.entries().flatMap(([name, value]) => {
      if (!content.includes(`${name.toString()} Do`)) return []
      const object = doc.context.lookup(value)
      return object instanceof PDFRawStream ? [object] : []
    })
  })
}

async function withUnsupportedFields(signed = false): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await createFormFixture(), { updateMetadata: false })
  const form = doc.getForm()
  form.createButton('submit').addToPage('Submit', doc.getPage(1), {
    x: 350,
    y: 100,
    width: 120,
    height: 30,
  })
  const signature = doc.context.obj({ FT: 'Sig', T: PDFString.of('approval') })
  if (signed) {
    // A populated signature dictionary is sufficient to require refusal; the
    // filler must not attempt to validate or silently invalidate its signature.
    signature.set(
      PDFName.of('V'),
      doc.context.register(
        doc.context.obj({
          Type: 'Sig',
          Filter: 'Adobe.PPKLite',
          SubFilter: 'adbe.pkcs7.detached',
          ByteRange: [0, 100, 200, 300],
          Contents: PDFHexString.of('1234'),
        }),
      ),
    )
  }
  const fields = form.acroForm.dict.lookup(PDFName.of('Fields'), PDFArray)
  fields.push(doc.context.register(signature))
  fields.push(
    doc.context.register(
      doc.context.obj({
        FT: 'UnknownFieldType',
        T: PDFString.of('futureField'),
        V: PDFString.of('preserve me'),
      }),
    ),
  )
  return doc.save({ updateFieldAppearances: false })
}

describe('PDF form inspection and editable export', () => {
  it('reports serialized initial values, field kinds, flags and options', async () => {
    const bytes = await createFormFixture()
    const summary = await inspectForm(bytes)
    expect(summary.pageCount).toBe(2)
    expect(summary.canFlatten).toBe(true)
    expect(await valuesOf(bytes)).toEqual(initialValues)
    expect(summary.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'fullName',
          label: 'Full name',
          type: 'text',
          required: true,
          readOnly: false,
          maxLength: 24,
        }),
        expect.objectContaining({ name: 'notes', type: 'text', multiline: true }),
        expect.objectContaining({ name: 'accountId', type: 'text', readOnly: true }),
        expect.objectContaining({ name: 'subscribed', type: 'checkbox' }),
        expect.objectContaining({ name: 'contact', type: 'radio', options: ['Email', 'Phone'] }),
        expect.objectContaining({
          name: 'country',
          type: 'dropdown',
          options: ['Taiwan', 'Japan', 'Canada'],
        }),
        expect.objectContaining({
          name: 'languages',
          type: 'list',
          multiselect: true,
          options: ['English', 'Chinese', 'Japanese'],
        }),
      ]),
    )
  })

  it('round-trips every supported edit while retaining readonly fields and constraints', async () => {
    const original = await createFormFixture()
    const edits = {
      fullName: 'Bob Example',
      notes: 'Updated first line\nUpdated second line',
      subscribed: false,
      contact: 'Phone',
      country: 'Japan',
      languages: ['Japanese'],
      accountId: 'TAMPERED',
    }
    const result = await fillForm(original, { values: edits, flatten: false })
    expect(await valuesOf(result)).toEqual({ ...edits, accountId: initialValues.accountId })
    const doc = await PDFDocument.load(result)
    expect(doc.getForm().getTextField('fullName').getMaxLength()).toBe(24)
    expect(doc.getForm().getTextField('fullName').isRequired()).toBe(true)
    expect(doc.getForm().getTextField('accountId').isReadOnly()).toBe(true)
    expectDrawnText(normalAppearance(doc, 'fullName'), 'Bob Example')
    expectDrawnText(normalAppearance(doc, 'country'), 'Japan')
    const checkWidget = doc.getForm().getCheckBox('subscribed').acroField.getWidgets()[0]
    expect(checkWidget.getAppearanceState()?.toString()).toBe('/Off')
    const radioWidgets = doc.getForm().getRadioGroup('contact').acroField.getWidgets()
    expect(radioWidgets[0].getAppearanceState()?.toString()).toBe('/Off')
    expect(radioWidgets[1].getAppearanceState()?.toString()).not.toBe('/Off')
    expectDrawnText(normalAppearance(doc, 'accountId'), 'ACCOUNT-007')
  })

  it('clears text, optional choices and checks without refusing a partial required form', async () => {
    const cleared = {
      fullName: '',
      notes: '',
      subscribed: false,
      contact: '',
      country: '',
      languages: [],
    }
    const result = await fillForm(await createFormFixture(), { values: cleared, flatten: false })
    expect(await valuesOf(result)).toEqual({ ...cleared, accountId: initialValues.accountId })
    const doc = await PDFDocument.load(result)
    expect(streamText(normalAppearance(doc, 'fullName'))).not.toContain(
      Buffer.from('Alice Example').toString('hex').toUpperCase(),
    )
    expect(streamText(normalAppearance(doc, 'country'))).not.toContain(
      Buffer.from('Taiwan').toString('hex').toUpperCase(),
    )
    for (const widget of doc.getForm().getRadioGroup('contact').acroField.getWidgets()) {
      expect(widget.getAppearanceState()?.toString()).toBe('/Off')
    }
  })

  it('starts every export from untouched original bytes, including after a flattened export', async () => {
    const original = await createFormFixture()
    const snapshot = original.slice()
    await fillForm(original, {
      values: { fullName: 'First export', country: 'Canada' },
      flatten: true,
    })
    const second = await fillForm(original, { values: { notes: 'Second export' }, flatten: false })
    expect(original).toEqual(snapshot)
    expect(await valuesOf(original)).toEqual(initialValues)
    expect(await valuesOf(second)).toEqual({ ...initialValues, notes: 'Second export' })
  })

  it.each<[string, FormValue, RegExp]>([
    ['country', 'Atlantis', /country|option|choice/i],
    ['contact', 'Fax', /contact|option|choice/i],
    ['languages', ['Klingon'], /languages|option|choice/i],
    ['fullName', 'x'.repeat(25), /fullName|length|24/i],
    ['fullName', true, /fullName|text|string|type/i],
    ['subscribed', 'yes', /subscribed|boolean|type/i],
    ['contact', ['Email'], /contact|string|type/i],
    ['country', true, /country|string|type/i],
    ['languages', true, /languages|array|type/i],
  ])('rejects invalid %s value %j instead of coercing it', async (name, value, message) => {
    await expect(
      fillForm(await createFormFixture(), { values: { [name]: value }, flatten: false }),
    ).rejects.toThrow(message)
  })

  it('permits custom text only for an explicitly editable dropdown', async () => {
    const doc = await PDFDocument.load(await createFormFixture())
    doc.getForm().getDropdown('country').enableEditing()
    const result = await fillForm(await doc.save(), {
      values: { country: 'Custom country' },
      flatten: false,
    })
    expect((await valuesOf(result)).country).toBe('Custom country')
    expectDrawnText(normalAppearance(await PDFDocument.load(result), 'country'), 'Custom country')
  })

  it('preserves export values while drawing display labels for paired choice options', async () => {
    const doc = await PDFDocument.load(await createFormFixture())
    const dropdown = doc.getForm().getDropdown('country')
    dropdown.acroField.setOptions([
      { value: PDFString.of('TW'), display: PDFString.of('Taiwan') },
      { value: PDFString.of('JP'), display: PDFString.of('Japan') },
    ])
    dropdown.acroField.dict.set(PDFName.of('V'), PDFString.of('TW'))
    const original = await doc.save({ updateFieldAppearances: false })
    expect(
      (await inspectForm(original)).fields.find((field) => field.name === 'country'),
    ).toMatchObject({
      value: 'Taiwan',
      options: ['Taiwan', 'Japan'],
    })
    const result = await fillForm(original, { values: { country: 'Japan' }, flatten: false })
    const output = await PDFDocument.load(result)
    expect(
      output
        .getForm()
        .getDropdown('country')
        .acroField.getValues()
        .map((value) => value.decodeText()),
    ).toEqual(['JP'])
    expect((await valuesOf(result)).country).toBe('Japan')
    expectDrawnText(normalAppearance(output, 'country'), 'Japan')
  })
})

describe('flattened form content', () => {
  it('removes interactive fields and annotations but paints current appearances on both pages', async () => {
    const result = await fillForm(await createFormFixture(), {
      values: {
        fullName: 'Flattened Alice',
        country: 'Canada',
        subscribed: false,
        contact: 'Phone',
      },
      flatten: true,
    })
    const doc = await PDFDocument.load(result)
    expect(doc.getForm().getFields()).toEqual([])
    expect(doc.getPageCount()).toBe(2)
    for (const page of doc.getPages()) expect(page.node.Annots()?.size() ?? 0).toBe(0)
    for (let index = 0; index < 2; index++) expect(pageContent(doc, index)).toContain(' Do')
    const appearances = paintedAppearances(doc)
    expect(appearances.length).toBeGreaterThanOrEqual(8)
    const painted = appearances.map(streamText).join('\n').toLowerCase()
    for (const text of ['Flattened Alice', 'Canada', 'ACCOUNT-007']) {
      expect(painted).toContain(Buffer.from(text).toString('hex'))
    }
    expect(painted).not.toContain(Buffer.from('Alice Example').toString('hex'))
    expect(painted).not.toContain(Buffer.from('Taiwan').toString('hex'))
  })

  it('keeps every multiline baseline inside the widget after changing fonts', async () => {
    const fontBytes = new Uint8Array(readFileSync(FONT_PATH))
    const result = await fillForm(await createFormFixture(), {
      values: { notes: 'Review notes\nNo file upload' },
      flatten: false,
      fontBytes,
    })
    const doc = await PDFDocument.load(result)
    const text = streamText(normalAppearance(doc, 'notes'))
    const baselines = [...text.matchAll(/1 0 0 1 [-\d.]+ ([-\d.]+) Tm/g)].map((match) =>
      Number(match[1]),
    )
    expect(baselines).toHaveLength(2)
    for (const baseline of baselines) {
      expect(baseline).toBeGreaterThanOrEqual(2)
      expect(baseline).toBeLessThanOrEqual(109)
    }
    expect(doc.getForm().getTextField('notes').getText()).toBe('Review notes\nNo file upload')
  }, 30_000)

  it('keeps unrelated link annotations when removing form widgets', async () => {
    const source = await PDFDocument.load(await createFormFixture())
    const page = source.getPage(0)
    const link = source.context.register(
      source.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [40, 100, 200, 120],
        A: { S: 'URI', URI: PDFString.of('https://nymbx.dev/tools') },
      }),
    )
    page.node.addAnnot(link)
    const result = await fillForm(await source.save(), { values: {}, flatten: true })
    const output = await PDFDocument.load(result)
    const annotations = output.getPage(0).node.Annots()!
    expect(annotations.size()).toBe(1)
    const retained = output.context.lookup(annotations.get(0), PDFDict)
    expect(retained.lookup(PDFName.of('Subtype'))).toBe(PDFName.of('Link'))
    expect(
      retained.lookup(PDFName.of('A'), PDFDict).lookup(PDFName.of('URI'), PDFString).decodeText(),
    ).toBe('https://nymbx.dev/tools')
  })
})

describe('unsupported and unsafe documents', () => {
  it('detects hybrid XFA before the AcroForm parser can silently remove it', async () => {
    const bytes = await createXfaFixture()
    const original = bytes.slice()
    await expect(inspectForm(bytes)).rejects.toThrow(/XFA/i)
    await expect(
      fillForm(bytes, { values: { fullName: 'No data loss' }, flatten: false }),
    ).rejects.toThrow(/XFA/i)
    expect(bytes).toEqual(original)
    const doc = await PDFDocument.load(bytes)
    expect(doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('XFA'))).toBe(true)
  })

  it('explains no-form input without offering an unsafe flatten operation', async () => {
    const bytes = await createNoFormFixture()
    await expect(inspectForm(bytes)).rejects.toThrow(/no.*(form|field)|not.*(form|field)/i)
    await expect(fillForm(bytes, { values: {}, flatten: false })).rejects.toThrow(/form|field/i)
  })

  it('rejects corrupt input with a PDF diagnostic', async () => {
    const bytes = new TextEncoder().encode('This is not a PDF file')
    await expect(inspectForm(bytes)).rejects.toThrow(/PDF|invalid|corrupt|parse/i)
    await expect(fillForm(bytes, { values: {}, flatten: false })).rejects.toThrow(
      /PDF|invalid|corrupt|parse/i,
    )
  })

  it('refuses an encryption-marked PDF instead of ignoring encryption', async () => {
    const doc = await PDFDocument.load(await createFormFixture())
    doc.context.trailerInfo.Encrypt = doc.context.register(
      doc.context.obj({
        Filter: 'Standard',
        V: 1,
        R: 2,
        Length: 40,
        P: -4,
        O: PDFHexString.of('00'.repeat(32)),
        U: PDFHexString.of('00'.repeat(32)),
      }),
    )
    const bytes = await doc.save()
    await expect(inspectForm(bytes)).rejects.toThrow(/encrypt|password|unlock/i)
    await expect(fillForm(bytes, { values: {}, flatten: false })).rejects.toThrow(
      /encrypt|password|unlock/i,
    )
  })

  it('lists unsigned signatures, buttons and unknown fields without deleting them', async () => {
    const bytes = await withUnsupportedFields()
    const summary = await inspectForm(bytes)
    expect(summary.canFlatten).toBe(false)
    for (const name of ['approval', 'submit', 'futureField']) {
      expect(summary.fields.find((field) => field.name === name)).toMatchObject({
        type: 'unsupported',
        reason: expect.any(String),
      })
      expect(summary.fields.find((field) => field.name === name)?.reason?.length).toBeGreaterThan(0)
    }
    const output = await fillForm(bytes, { values: { fullName: 'Still editable' }, flatten: false })
    const doc = await PDFDocument.load(output)
    const fields = doc.catalog
      .lookup(PDFName.of('AcroForm'), PDFDict)
      .lookup(PDFName.of('Fields'), PDFArray)
    const dictionaries = fields.asArray().map((ref) => doc.context.lookup(ref, PDFDict))
    const fieldName = (field: PDFDict) => {
      const value = field.lookup(PDFName.of('T'))
      return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : ''
    }
    expect(dictionaries.map(fieldName)).toEqual(
      expect.arrayContaining(['approval', 'submit', 'futureField']),
    )
    const future = dictionaries.find((field) => fieldName(field) === 'futureField')
    expect(future?.lookup(PDFName.of('V'), PDFString).decodeText()).toBe('preserve me')
    await expect(fillForm(bytes, { values: {}, flatten: true })).rejects.toThrow(
      /flatten|unsupported|signature/i,
    )
  })

  it('refuses populated signature fields for inspection and every export mode', async () => {
    const bytes = await withUnsupportedFields(true)
    await expect(inspectForm(bytes)).rejects.toThrow(/signed|signature/i)
    for (const flatten of [false, true]) {
      await expect(fillForm(bytes, { values: {}, flatten })).rejects.toThrow(/signed|signature/i)
    }
  })
})

function expectVisibleUnicode(doc: PDFDocument, appearance: PDFRawStream, text: string) {
  const resources = appearance.dict.lookup(PDFName.of('Resources'), PDFDict)
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict)
  const font = fonts
    .entries()
    .map(([, ref]) => doc.context.lookup(ref, PDFDict))
    .find((entry) => entry.has(PDFName.of('ToUnicode')))
  expect(font).toBeDefined()
  if (!font) throw new Error('No Unicode font in appearance')
  const cmap = streamText(rawStream(doc, font.get(PDFName.of('ToUnicode'))))
  const descendant = font.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict)
  const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict)
  const program = fontkit.create(
    decodePDFRawStream(rawStream(doc, descriptor.get(PDFName.of('FontFile2')))).decode(),
  ) as FontkitFont & {
    glyphForCodePoint: (code: number) => FontkitGlyph
  }
  const drawing = streamText(appearance).toLowerCase()
  const encoded: string[] = []
  for (const character of text) {
    const unicode = character.charCodeAt(0).toString(16).padStart(4, '0')
    const match = cmap.match(new RegExp(`<([0-9a-f]+)>\\s*<${unicode}>`, 'i'))
    expect(match, `Unicode mapping for ${character}`).not.toBeNull()
    if (!match) throw new Error(`Missing mapping for ${character}`)
    const id = Number.parseInt(match[1], 16)
    expect(id).toBeGreaterThan(0)
    expect(
      program.getGlyph(id).path.commands.length,
      `Visible outline for ${character}`,
    ).toBeGreaterThan(0)
    encoded.push(match[1].toLowerCase())
  }
  expect(drawing).toContain(`<${encoded.join('')}>`)
  return program
}

describe('bundled multilingual font', () => {
  it.each([false, true])(
    'exports real CJK glyph outlines and Unicode mapping (flatten=%s)',
    async (flatten) => {
      const fontBytes = new Uint8Array(readFileSync(FONT_PATH))
      const text = '王小明中文'
      const result = await fillForm(await createFormFixture(), {
        values: { fullName: text },
        flatten,
        fontBytes,
      })
      const doc = await PDFDocument.load(result)
      if (flatten) {
        expect(doc.getForm().getFields()).toEqual([])
        const appearances = paintedAppearances(doc)
        const appearance = appearances.find((stream) => {
          const resources = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
          const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)
          return fonts?.entries().some(([, ref]) => {
            const font = doc.context.lookup(ref, PDFDict)
            const cmap = doc.context.lookup(font.get(PDFName.of('ToUnicode')))
            if (!(cmap instanceof PDFRawStream)) return false
            const mapping = streamText(cmap)
            const encoded = Array.from(text, (character) => {
              const unicode = character.charCodeAt(0).toString(16).padStart(4, '0')
              return mapping.match(new RegExp(`<([0-9a-f]+)>\\s*<${unicode}>`, 'i'))?.[1]
            })
            return (
              encoded.every(Boolean) &&
              streamText(stream)
                .toLowerCase()
                .includes(`<${encoded.join('').toLowerCase()}>`)
            )
          })
        })
        expect(appearance).toBeDefined()
        if (!appearance) throw new Error('No painted Unicode appearance')
        expectVisibleUnicode(doc, appearance, text)
      } else {
        expect(doc.getForm().getTextField('fullName').getText()).toBe(text)
        const program = expectVisibleUnicode(doc, normalAppearance(doc, 'fullName'), text)
        expect(
          program.glyphForCodePoint('龍'.codePointAt(0)!).path.commands.length,
        ).toBeGreaterThan(0)
      }
    },
    30_000,
  )

  it('rejects missing glyphs instead of emitting invisible replacement glyphs', async () => {
    const fontBytes = new Uint8Array(readFileSync(FONT_PATH))
    await expect(
      fillForm(await createFormFixture(), {
        values: { fullName: '\u{10ffff}' },
        flatten: true,
        fontBytes,
      }),
    ).rejects.toThrow(/glyph|font|character|support/i)
  }, 30_000)
})
