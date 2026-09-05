import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { summarize } from './inspect'
import type { Summary } from './types'

export function fixture(name: string): Uint8Array {
  // Vitest transforms this module, so import.meta.url is not a file URL; the
  // fixtures are resolved from the repo root instead.
  return new Uint8Array(
    readFileSync(resolve(process.cwd(), 'src/tools/pdf-metadata/fixtures', name)),
  )
}

export async function summaryOf(name: string): Promise<Summary> {
  const bytes = fixture(name)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return summarize(doc, bytes)
}

describe('summarize', () => {
  it('reads every carrier of the full fixture', async () => {
    const summary = await summaryOf('full-metadata.pdf')
    expect(summary.pages).toBe(1)
    expect(summary.bytes).toBe(5566)
    expect(summary.info?.map((entry) => entry.key)).toEqual([
      'Title',
      'Author',
      'Subject',
      'Keywords',
      'Creator',
      'Producer',
      'CreationDate',
      'ModDate',
      'Company',
      'SourceModified',
    ])
    expect(Object.fromEntries(summary.info!.map((e) => [e.key, e.value]))).toMatchObject({
      Title: 'Quarterly Compliance Report',
      Author: 'Alice Example',
      Subject: 'Internal assessment — draft',
      // pdf-lib's setKeywords() joined the fixture's keyword array with
      // spaces — the exact bug this tool avoids by writing Info values itself.
      Keywords: 'compliance audit 2025',
      Creator: 'Acme Writer 3.2',
      Producer: 'Acme PDF Engine 9.1',
      CreationDate: 'D:20240305021530Z',
      ModDate: 'D:20250120090000Z',
      Company: 'Acme Corp',
      SourceModified: "D:20240305101530+08'00'",
    })
    expect(summary.info!.filter((e) => !e.standard).map((e) => e.key)).toEqual([
      'Company',
      'SourceModified',
    ])
    expect(summary.info!.filter((e) => e.kind === 'date').map((e) => e.key)).toEqual([
      'CreationDate',
      'ModDate',
      'SourceModified',
    ])
    expect(summary.xmp).toContain('Quarterly Compliance Report')
    expect(summary.xmpBytes).toBe(1332)
    expect(summary.extraXmp).toBe(2)
    expect(summary.pieceInfo).toBe(2)
    expect(summary.id).toEqual([
      '0123456789abcdef0123456789abcdef',
      'fedcba9876543210fedcba9876543210',
    ])
    expect(summary.hasSignature).toBe(false)
    expect(summary.attachments).toBe(0)
  })

  it('reports no Info dictionary and decodes a Flate-compressed packet', async () => {
    const summary = await summaryOf('xmp-only-no-info.pdf')
    expect(summary.info).toBeNull()
    expect(summary.xmp).toContain('XMP-only Title')
    expect(summary.xmpBytes).toBeGreaterThan(1000)
    expect(summary.id).toBeNull()
    expect(summary.extraXmp).toBe(0)
    expect(summary.pieceInfo).toBe(0)
  })

  it('reads CJK values and keeps an unparsable date verbatim', async () => {
    const summary = await summaryOf('info-only-cjk.pdf')
    expect(Object.fromEntries(summary.info!.map((e) => [e.key, e.value]))).toEqual({
      Title: '繁體中文標題 — Info only',
      Author: '王小明',
      Creator: 'Word 365',
      CreationDate: 'not-a-date',
    })
    expect(summary.xmp).toBeNull()
    expect(summary.xmpBytes).toBe(0)
    expect(summary.id).toBeNull()
  })

  it('reports an empty document', async () => {
    const summary = await summaryOf('no-metadata.pdf')
    expect(summary).toMatchObject({
      pages: 1,
      info: null,
      xmp: null,
      xmpBytes: 0,
      extraXmp: 0,
      pieceInfo: 0,
      id: null,
      hasSignature: false,
      attachments: 0,
      orphans: 0,
    })
  })

  it('counts the leftovers of an earlier revision', async () => {
    // Two revisions: the update points /Info at a new object, so the original
    // Info dictionary (with the old Title) is still in the file, unreferenced.
    const summary = await summaryOf('incremental-update.pdf')
    expect(summary.info?.find((e) => e.key === 'Title')?.value).toBe('Public title')
    expect(summary.orphans).toBe(1)
    expect((await summaryOf('full-metadata.pdf')).orphans).toBe(0)
  })

  it('detects a signature field', async () => {
    const summary = await summaryOf('signed-field.pdf')
    expect(summary.hasSignature).toBe(true)
    expect(summary.info).not.toBeNull()
  })

  it('decodes metadata from an object-stream file', async () => {
    const summary = await summaryOf('full-objstm.pdf')
    expect(summary.info?.length).toBe(8)
    expect(summary.xmp).toContain('Quarterly Compliance Report')
    expect(summary.hasSignature).toBe(false)
  })
})
