import { describe, expect, it } from 'vitest'
import { outputFilename } from './filename'
import type { Changes } from './types'

const base: Changes = {
  info: { set: {}, remove: [] },
  xmp: 'keep',
  extraXmp: false,
  pieceInfo: false,
  resetId: false,
}

describe('outputFilename', () => {
  it('uses -clean when Info and XMP are both removed', () => {
    expect(outputFilename('report.pdf', { ...base, info: 'remove', xmp: 'remove' })).toBe(
      'report-clean.pdf',
    )
  })

  it('uses -edited for anything else', () => {
    expect(outputFilename('report.pdf', base)).toBe('report-edited.pdf')
    expect(outputFilename('report.pdf', { ...base, info: 'remove' })).toBe('report-edited.pdf')
    expect(outputFilename('report.pdf', { ...base, xmp: 'remove' })).toBe('report-edited.pdf')
  })

  it('replaces the extension case-insensitively and copes with odd names', () => {
    expect(outputFilename('Scan.PDF', base)).toBe('Scan-edited.pdf')
    expect(outputFilename('no-extension', base)).toBe('no-extension-edited.pdf')
    expect(outputFilename('  ', base)).toBe('document-edited.pdf')
  })
})
