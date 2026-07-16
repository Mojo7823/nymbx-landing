import { describe, expect, it } from 'vitest'
import { parseSvgSize } from './svg'

describe('parseSvgSize', () => {
  it('reads dimensions from the viewBox', () => {
    expect(parseSvgSize('<svg viewBox="0 0 640 480"></svg>')).toEqual({ width: 640, height: 480 })
  })

  it('falls back to width/height attributes', () => {
    expect(parseSvgSize('<svg width="120" height="80"></svg>')).toEqual({ width: 120, height: 80 })
  })

  it('handles comma-separated viewBox values', () => {
    expect(parseSvgSize('<svg viewBox="0,0,300,150"></svg>')).toEqual({ width: 300, height: 150 })
  })

  it('returns a sane default when nothing is declared', () => {
    expect(parseSvgSize('<svg></svg>')).toEqual({ width: 800, height: 600 })
  })
})
