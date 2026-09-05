import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fixture } from './inspect.test'
import { summarize } from './inspect'
import { applyChanges } from './sanitize'
import { parseXmp } from './xmp'
import type { Changes, Summary } from './types'

const STRIP_ALL: Changes = {
  info: 'remove',
  xmp: 'remove',
  extraXmp: true,
  pieceInfo: true,
  resetId: true,
}

const KEEP: Changes = {
  info: { set: {}, remove: [] },
  xmp: 'keep',
  extraXmp: false,
  pieceInfo: false,
  resetId: false,
}

async function summarizeBytes(bytes: Uint8Array): Promise<Summary> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return summarize(doc, bytes)
}

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/** Every indirect object of a saved file, serialised — including ones nothing references. */
async function allObjectsText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj.toString())
    .join('\n')
}

describe('applyChanges — earlier revisions', () => {
  it('drops the unreferenced Info dictionary an incremental update left behind', async () => {
    // pdf-lib writes every parsed object back, and object streams hide them
    // from a plain text search — so check the objects of the output itself.
    expect(latin1(fixture('incremental-update.pdf'))).toContain('SECRET-ORIGINAL-TITLE')
    const { bytes, report } = await applyChanges(fixture('incremental-update.pdf'), STRIP_ALL)
    expect(report.orphansRemoved).toBe(1)
    expect(report.infoDictRemoved).toBe(true)
    const objects = await allObjectsText(bytes)
    expect(objects).not.toContain('SECRET')
    expect(objects).not.toContain('Public title')
    expect((await summarizeBytes(bytes)).pages).toBe(1)
  })

  it('removes orphans even when nothing else changes', async () => {
    const { bytes, report } = await applyChanges(fixture('incremental-update.pdf'), KEEP)
    expect(report.orphansRemoved).toBe(1)
    expect(await allObjectsText(bytes)).not.toContain('SECRET')
    const summary = await summarizeBytes(bytes)
    expect(summary.info?.find((e) => e.key === 'Title')?.value).toBe('Public title')
    expect(summary.orphans).toBe(0)
  })
})

describe('applyChanges — strip all', () => {
  it('removes every carrier of full-metadata.pdf', async () => {
    const input = fixture('full-metadata.pdf')
    const { bytes, report } = await applyChanges(input, STRIP_ALL)

    const summary = await summarizeBytes(bytes)
    expect(summary.info).toBeNull()
    expect(summary.xmp).toBeNull()
    expect(summary.extraXmp).toBe(0)
    expect(summary.pieceInfo).toBe(0)
    expect(summary.pages).toBe(1)
    expect(summary.id).not.toBeNull()
    expect(summary.id).not.toEqual([
      '0123456789abcdef0123456789abcdef',
      'fedcba9876543210fedcba9876543210',
    ])

    const text = latin1(bytes)
    for (const secret of [
      'Acme',
      'Alice',
      'LAPTOP-42',
      'Page-level',
      'XObject-level',
      'uuid:1111',
      'pdf-lib',
    ]) {
      expect(text).not.toContain(secret)
    }

    expect(report).toMatchObject({
      before: input.length,
      infoDictRemoved: true,
      xmp: 'removed',
      extraXmpRemoved: 2,
      pieceInfoRemoved: 2,
      idReset: true,
      signatureInvalidated: false,
    })
    expect(report.after).toBe(bytes.length)
    expect(report.after).toBeLessThan(report.before)
  })

  it('leaves the input buffer untouched', async () => {
    const input = fixture('full-metadata.pdf')
    const copy = input.slice()
    await applyChanges(input, STRIP_ALL)
    expect(input).toEqual(copy)
  })

  it('cleans a file that already has no metadata, and gives it an ID', async () => {
    const { bytes, report } = await applyChanges(fixture('no-metadata.pdf'), STRIP_ALL)
    const summary = await summarizeBytes(bytes)
    expect(summary.info).toBeNull()
    expect(summary.id).not.toBeNull()
    expect(summary.pages).toBe(1)
    expect(report.infoDictRemoved).toBe(false)
    expect(report.xmp).toBe('none')
  })

  it('cleans an object-stream file', async () => {
    const { bytes } = await applyChanges(fixture('full-objstm.pdf'), STRIP_ALL)
    const summary = await summarizeBytes(bytes)
    expect(summary.info).toBeNull()
    expect(summary.xmp).toBeNull()
    expect(latin1(bytes)).not.toContain('pdf-lib')
  })

  it('flags a signed document as invalidated', async () => {
    const { report } = await applyChanges(fixture('signed-field.pdf'), STRIP_ALL)
    expect(report.signatureInvalidated).toBe(true)
  })
})

describe('applyChanges — editing Info', () => {
  it('writes values verbatim and removes a key', async () => {
    const { bytes, report } = await applyChanges(fixture('info-only-cjk.pdf'), {
      ...KEEP,
      info: { set: { Title: 'Edited 標題 ✓', Keywords: 'a, b; c' }, remove: ['CreationDate'] },
    })
    const summary = await summarizeBytes(bytes)
    const values = Object.fromEntries(summary.info!.map((entry) => [entry.key, entry.value]))
    expect(values).toEqual({
      Title: 'Edited 標題 ✓',
      Keywords: 'a, b; c',
      Author: '王小明',
      Creator: 'Word 365',
    })
    expect(report.infoSet).toEqual(['Title', 'Keywords'])
    expect(report.infoRemoved).toEqual(['CreationDate'])
    expect(latin1(bytes)).not.toContain('pdf-lib')
  })

  it('treats an empty value in `set` as a removal', async () => {
    const { bytes, report } = await applyChanges(fixture('full-metadata.pdf'), {
      ...KEEP,
      info: { set: { Author: '' }, remove: ['Company'] },
    })
    const summary = await summarizeBytes(bytes)
    const keys = summary.info!.map((entry) => entry.key)
    expect(keys).not.toContain('Author')
    expect(keys).not.toContain('Company')
    expect(keys).toContain('Title')
    expect(report.infoRemoved).toEqual(['Company', 'Author'])
  })

  it('creates an Info dictionary for a file that had none', async () => {
    const { bytes } = await applyChanges(fixture('xmp-only-no-info.pdf'), {
      ...KEEP,
      info: { set: { Title: 'Now with Info' }, remove: [] },
    })
    const summary = await summarizeBytes(bytes)
    expect(summary.info).toEqual([
      { key: 'Title', value: 'Now with Info', kind: 'text', standard: true },
    ])
  })

  it('writes dates as D:…Z in UTC', async () => {
    const { bytes } = await applyChanges(fixture('info-only-cjk.pdf'), {
      ...KEEP,
      info: { set: { CreationDate: '2024-03-05T02:15:30Z' }, remove: [] },
    })
    const summary = await summarizeBytes(bytes)
    const creation = summary.info!.find((entry) => entry.key === 'CreationDate')
    expect(creation).toEqual({
      key: 'CreationDate',
      value: 'D:20240305021530Z',
      kind: 'date',
      standard: true,
    })
  })

  it('writes Trapped as a name object', async () => {
    const { bytes } = await applyChanges(fixture('info-only-cjk.pdf'), {
      ...KEEP,
      info: { set: { Trapped: 'True' }, remove: [] },
    })
    const summary = await summarizeBytes(bytes)
    expect(summary.info!.find((entry) => entry.key === 'Trapped')).toEqual({
      key: 'Trapped',
      value: '/True',
      kind: 'other',
      standard: true,
    })
  })
})

describe('applyChanges — XMP', () => {
  it('keeps the packet byte-identical', async () => {
    const before = await summarizeBytes(fixture('full-metadata.pdf'))
    const { bytes, report } = await applyChanges(fixture('full-metadata.pdf'), KEEP)
    const after = await summarizeBytes(bytes)
    expect(after.xmp).toBe(before.xmp)
    expect(report.xmp).toBe('kept')
  })

  it('regenerates the packet from the resulting Info fields', async () => {
    const { bytes, report } = await applyChanges(fixture('full-metadata.pdf'), {
      ...KEEP,
      info: { set: { Title: 'Edited 標題 ✓' }, remove: ['Author'] },
      xmp: 'regenerate',
    })
    const summary = await summarizeBytes(bytes)
    const { properties, error } = parseXmp(summary.xmp!)
    expect(error).toBeUndefined()
    const values = Object.fromEntries(properties.map((p) => [p.name, p.value]))
    expect(values['dc:title']).toBe('Edited 標題 ✓')
    expect(values['dc:creator']).toBeUndefined()
    expect(values['xmp:CreateDate']).toBe('2024-03-05T02:15:30Z')
    expect(summary.xmp).not.toContain('xmpMM')
    expect(summary.xmp).not.toContain('photoshop')
    expect(summary.xmp).not.toContain('MetadataDate')
    expect(report.xmp).toBe('regenerated')
  })

  it('creates a packet for a file that had none', async () => {
    const { bytes, report } = await applyChanges(fixture('info-only-cjk.pdf'), {
      ...KEEP,
      xmp: 'regenerate',
    })
    const summary = await summarizeBytes(bytes)
    expect(summary.xmp).toContain('繁體中文標題')
    expect(report.xmp).toBe('created')
  })

  it('removes the packet when regenerating from empty fields', async () => {
    const { bytes, report } = await applyChanges(fixture('full-metadata.pdf'), {
      ...KEEP,
      info: 'remove',
      xmp: 'regenerate',
    })
    const summary = await summarizeBytes(bytes)
    expect(summary.xmp).toBeNull()
    expect(report.xmp).toBe('removed')
  })

  it('removes only the extra streams when asked', async () => {
    const { bytes, report } = await applyChanges(fixture('full-metadata.pdf'), {
      ...KEEP,
      extraXmp: true,
    })
    const summary = await summarizeBytes(bytes)
    expect(summary.extraXmp).toBe(0)
    expect(summary.xmp).not.toBeNull()
    expect(summary.pieceInfo).toBe(2)
    expect(report.extraXmpRemoved).toBe(2)
    expect(report.pieceInfoRemoved).toBe(0)
  })
})
