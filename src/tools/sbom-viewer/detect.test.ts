import { describe, expect, it } from 'vitest'
import { describeJsonError, detectFormat, fileStem, parseXml, sniffInput } from './detect'

describe('sniffInput', () => {
  it('recognizes JSON, XML and neither', () => {
    expect(sniffInput('  \n{"a":1}')).toBe('json')
    expect(sniffInput('[1]')).toBe('json')
    expect(sniffInput('﻿<?xml version="1.0"?><bom/>')).toBe('xml')
    expect(sniffInput('<bom/>')).toBe('xml')
    expect(sniffInput('hello')).toBe('unknown')
    expect(sniffInput('')).toBe('unknown')
  })
})

describe('detectFormat', () => {
  it('detects CycloneDX from bomFormat', () => {
    expect(detectFormat({ bomFormat: 'CycloneDX', specVersion: '1.4' })).toEqual({
      format: 'CycloneDX',
      specVersion: '1.4',
    })
  })

  it('detects SPDX from spdxVersion', () => {
    expect(detectFormat({ spdxVersion: 'SPDX-2.3' })).toEqual({
      format: 'SPDX',
      specVersion: 'SPDX-2.3',
    })
  })

  it('falls back to a bare specVersion', () => {
    expect(detectFormat({ specVersion: '1.6' })).toEqual({
      format: 'CycloneDX',
      specVersion: '1.6',
    })
  })

  it('rejects anything else', () => {
    expect(detectFormat({ hello: 'world' })).toBeNull()
    expect(detectFormat([{ bomFormat: 'CycloneDX' }])).toBeNull()
    expect(detectFormat(null)).toBeNull()
    expect(detectFormat('{}')).toBeNull()
  })
})

describe('fileStem', () => {
  it('drops only the last extension', () => {
    expect(fileStem('laravel-cdx-1.4.json')).toBe('laravel-cdx-1.4')
    expect(fileStem('app.cdx.json')).toBe('app.cdx')
    expect(fileStem('/tmp/dir/sbom.xml')).toBe('sbom')
    expect(fileStem('noext')).toBe('noext')
    expect(fileStem('.hidden')).toBe('.hidden')
  })
})

describe('describeJsonError', () => {
  it('locates a real syntax error by line and column', () => {
    const text = '{\n  "a": 1,\n  bad\n}'
    let message = ''
    try {
      JSON.parse(text)
    } catch (error) {
      message = describeJsonError(error, text)
    }
    expect(message).toMatch(/line \d+ ?,? column \d+/)
  })

  it('does not repeat a line/column the engine already reported', () => {
    expect(
      describeJsonError(new Error('Unexpected token at position 5 (line 1 column 6)'), '12345x'),
    ).toBe('Unexpected token at position 5 (line 1 column 6)')
  })

  it('adds line and column when only a raw position is reported', () => {
    expect(describeJsonError(new Error('Bad JSON at position 5'), 'ab\ncdef')).toBe(
      'Bad JSON at position 5 (line 2, column 3)',
    )
  })

  it('passes the message through when there is no position', () => {
    expect(describeJsonError(new Error('Unexpected end of JSON input'), '')).toBe(
      'Unexpected end of JSON input',
    )
  })

  it('handles non-Error throws', () => {
    expect(describeJsonError('boom', '')).toBe('Could not parse this file as JSON.')
  })
})

describe('parseXml', () => {
  it('parses a CycloneDX bom', () => {
    const result = parseXml('<bom xmlns="http://cyclonedx.org/schema/bom/1.4"></bom>')
    expect(result.ok).toBe(true)
  })

  it('reports the parsererror text for malformed XML', () => {
    const result = parseXml('<bom><unclosed></bom>')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0)
  })

  it('rejects well-formed XML that is not a bom', () => {
    const result = parseXml('<rss><channel/></rss>')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('<rss>')
  })
})
