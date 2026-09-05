import { describe, expect, it } from 'vitest'
import {
  CHARDET_LABELS,
  chardetLabel,
  encodingGroups,
  encodingInfo,
  encodingName,
  encodingOrder,
  hasEncoder,
  SUPPORTED_ENCODINGS,
} from './encodings'

describe('SUPPORTED_ENCODINGS', () => {
  it('lists every label exactly once', () => {
    const labels = SUPPORTED_ENCODINGS.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('constructs a TextDecoder whose canonical name is the label itself', () => {
    for (const { label } of SUPPORTED_ENCODINGS) {
      const decoder = new TextDecoder(label)
      expect(decoder.encoding, label).toBe(label)
    }
  })

  it('excludes aliases and unsupported labels', () => {
    const labels = new Set(SUPPORTED_ENCODINGS.map((e) => e.label))
    for (const excluded of ['gbk', 'utf-16', 'iso-8859-1', 'x-user-defined', 'replacement']) {
      expect(labels.has(excluded), excluded).toBe(false)
    }
  })

  it('marks only iso-2022-jp as having no encoder', () => {
    const withoutEncoder = SUPPORTED_ENCODINGS.filter((e) => !hasEncoder(e.label)).map(
      (e) => e.label,
    )
    expect(withoutEncoder).toEqual(['iso-2022-jp'])
    expect(hasEncoder('not-a-label')).toBe(false)
  })
})

describe('lookup helpers', () => {
  it('resolves info, names and table order', () => {
    expect(encodingInfo('big5')?.name).toBe('Big5 (CP950, HKSCS)')
    expect(encodingInfo('nope')).toBeUndefined()
    expect(encodingName('utf-8')).toBe('UTF-8')
    expect(encodingName('nope')).toBe('nope')
    expect(encodingOrder('utf-8')).toBe(0)
    expect(encodingOrder('big5')).toBeLessThan(encodingOrder('windows-1252'))
    expect(encodingOrder('nope')).toBe(SUPPORTED_ENCODINGS.length)
  })

  it('groups every encoding, preserving table order', () => {
    const groups = encodingGroups()
    expect(groups.flatMap((g) => g.encodings.map((e) => e.label))).toEqual(
      SUPPORTED_ENCODINGS.map((e) => e.label),
    )
    expect(groups[0].group).toBe('Unicode')
    // A group heading must not appear twice (bucketing is contiguous).
    const headings = groups.map((g) => g.group)
    expect(new Set(headings).size).toBe(headings.length)
  })
})

describe('chardet name map', () => {
  it('maps every documented chardet name to a supported label', () => {
    const labels = new Set(SUPPORTED_ENCODINGS.map((e) => e.label))
    for (const [name, label] of Object.entries(CHARDET_LABELS)) {
      expect(labels.has(label), `${name} → ${label}`).toBe(true)
      expect(chardetLabel(name)).toBe(label)
    }
  })

  it('covers the names chardet emits for our fixtures', () => {
    const expected: Record<string, string> = {
      'UTF-8': 'utf-8',
      'UTF-16LE': 'utf-16le',
      'UTF-16BE': 'utf-16be',
      Big5: 'big5',
      GB18030: 'gb18030',
      Shift_JIS: 'shift_jis',
      'EUC-JP': 'euc-jp',
      'EUC-KR': 'euc-kr',
      'ISO-2022-JP': 'iso-2022-jp',
      'ISO-8859-1': 'windows-1252',
      'ISO-8859-9': 'windows-1254',
      'KOI8-R': 'koi8-r',
      'windows-874': 'windows-874',
    }
    for (const [name, label] of Object.entries(expected)) {
      expect(chardetLabel(name), name).toBe(label)
    }
  })

  it('drops names TextDecoder cannot handle', () => {
    for (const name of ['ASCII', 'UTF-32LE', 'UTF-32BE', 'ISO-2022-KR', 'ISO-2022-CN']) {
      expect(chardetLabel(name), name).toBeNull()
    }
  })
})
