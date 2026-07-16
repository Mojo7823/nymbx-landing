import { describe, expect, it } from 'vitest'
import { buildCsv, buildTxt, normalizeExpected, type HashRow } from './hashLogic'

describe('normalizeExpected', () => {
  it('lowercases and trims', () => {
    expect(normalizeExpected('  BA7816BF ')).toBe('ba7816bf')
  })

  it('takes the hash from a pasted `sha256sum` output line', () => {
    expect(normalizeExpected('900150983cd24fb0d6963f7d28e17f72  file.bin')).toBe(
      '900150983cd24fb0d6963f7d28e17f72',
    )
  })

  it('returns empty string for blank input', () => {
    expect(normalizeExpected('   ')).toBe('')
  })
})

const rows: HashRow[] = [
  { name: 'a.txt', size: 3, hashes: { sha256: 'aaa', md5: 'bbb' } },
  { name: 'weird,"name".bin', size: 10, hashes: { sha256: 'ccc' } },
]

describe('buildCsv', () => {
  it('emits a header and one line per file/algorithm pair', () => {
    const csv = buildCsv(rows, ['sha256', 'md5'])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('File,Size (bytes),Algorithm,Hash')
    expect(lines[1]).toBe('a.txt,3,SHA-256,aaa')
    expect(lines[2]).toBe('a.txt,3,MD5,bbb')
  })

  it('quotes file names containing commas and doubles embedded quotes', () => {
    const csv = buildCsv(rows, ['sha256'])
    expect(csv).toContain('"weird,""name"".bin",10,SHA-256,ccc')
  })

  it('skips algorithms a file has no hash for', () => {
    const csv = buildCsv(rows, ['md5'])
    expect(csv).not.toContain('weird')
  })
})

describe('buildTxt', () => {
  it('writes checksum-file style lines grouped per algorithm', () => {
    const txt = buildTxt(rows, ['sha256', 'md5'])
    expect(txt).toBe('# SHA-256\naaa  a.txt\nccc  weird,"name".bin\n\n# MD5\nbbb  a.txt\n')
  })
})
