import { describe, expect, it } from 'vitest'
import { defaultOptions, optimizeSvg, savingsPercent } from './svg'

const VERBOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <!-- editor cruft -->
  <defs>
    <linearGradient id="keepMe" x1="0.000000" y1="0.000000" x2="1.000000" y2="0.000000">
      <stop offset="0" stop-color="#ff0000"/>
      <stop offset="1" stop-color="#0000ff"/>
    </linearGradient>
  </defs>
  <rect x="10.123456" y="10.123456" width="180.000000" height="80.000000" fill="url(#keepMe)"/>
</svg>`

describe('SVG optimizer', () => {
  it('shrinks verbose editor output at default settings', () => {
    const result = optimizeSvg(VERBOSE, defaultOptions())
    expect(result.outputBytes).toBeLessThan(result.inputBytes)
    expect(result.data).toContain('<svg')
  })

  it('keeps the viewBox by default and drops it when asked', () => {
    expect(optimizeSvg(VERBOSE, defaultOptions()).data).toContain('viewBox')
    expect(optimizeSvg(VERBOSE, { ...defaultOptions(), keepViewBox: false }).data).not.toContain(
      'viewBox',
    )
  })

  it('keeps IDs and their references by default, minifies when asked', () => {
    const kept = optimizeSvg(VERBOSE, defaultOptions()).data
    expect(kept).toContain('keepMe')
    expect(kept).toContain('url(#keepMe)')
    const minified = optimizeSvg(VERBOSE, { ...defaultOptions(), keepIds: false }).data
    expect(minified).not.toContain('keepMe')
    // …but the reference still resolves, so rendering is unchanged.
    expect(minified).toMatch(/url\(#\w+\)/)
  })

  it('honors the coordinate precision', () => {
    const precise = optimizeSvg(VERBOSE, { ...defaultOptions(), precision: 1 }).data
    expect(precise).not.toMatch(/\.\d{2,}/)
    const loose = optimizeSvg(VERBOSE, { ...defaultOptions(), precision: 5 }).data
    expect(loose.length).toBeGreaterThan(precise.length)
  })

  it('rejects empty, non-SVG, and malformed input with clear errors', () => {
    expect(() => optimizeSvg('   ', defaultOptions())).toThrow(/paste svg/i)
    expect(() => optimizeSvg('{"json": true}', defaultOptions())).toThrow(/no <svg>/i)
    expect(() => optimizeSvg('<svg><unclosed>', defaultOptions())).toThrow(/parse|well-formed/i)
  })

  it('computes whole-percent savings', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(1000, 1500)).toBe(-50)
    expect(savingsPercent(0, 10)).toBe(0)
  })
})
