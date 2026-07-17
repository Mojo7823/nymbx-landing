import { describe, expect, it } from 'vitest'
import {
  needsUnicodeFont,
  normalizeRotate,
  placeStamp,
  presetAnchor,
  viewedSize,
  viewedToUser,
} from './placement'

describe('normalizeRotate', () => {
  it('maps arbitrary angles onto 0/90/180/270', () => {
    expect(normalizeRotate(0)).toBe(0)
    expect(normalizeRotate(90)).toBe(90)
    expect(normalizeRotate(360)).toBe(0)
    expect(normalizeRotate(-90)).toBe(270)
    expect(normalizeRotate(450)).toBe(90)
  })
})

describe('viewedSize', () => {
  it('swaps dimensions for 90/270', () => {
    expect(viewedSize(595, 842, 0)).toEqual({ vw: 595, vh: 842 })
    expect(viewedSize(595, 842, 90)).toEqual({ vw: 842, vh: 595 })
    expect(viewedSize(595, 842, 180)).toEqual({ vw: 595, vh: 842 })
    expect(viewedSize(595, 842, 270)).toEqual({ vw: 842, vh: 595 })
  })
})

describe('viewedToUser', () => {
  const w = 595
  const h = 842
  it('is identity at rotate 0', () => {
    expect(viewedToUser(10, 20, w, h, 0)).toEqual({ x: 10, y: 20 })
  })
  it('maps the viewed corners back to the right user-space corners', () => {
    // rotate 90 (viewed size 842×595): viewed origin = user bottom-right
    expect(viewedToUser(0, 0, w, h, 90)).toEqual({ x: w, y: 0 })
    expect(viewedToUser(h, 595, w, h, 90)).toEqual({ x: 0, y: h })
    // rotate 180: viewed origin = user top-right
    expect(viewedToUser(0, 0, w, h, 180)).toEqual({ x: w, y: h })
    // rotate 270: viewed origin = user top-left
    expect(viewedToUser(0, 0, w, h, 270)).toEqual({ x: 0, y: h })
  })
  it('round-trips with the forward mapping', () => {
    // forward for 90: vx = y, vy = w − x
    const { x, y } = viewedToUser(300, 100, w, h, 90)
    expect([y, w - x]).toEqual([300, 100])
  })
})

describe('presetAnchor', () => {
  it('maps presets to anchor fractions', () => {
    expect(presetAnchor('bottom-left')).toEqual({ ax: 0, ay: 0 })
    expect(presetAnchor('top-right')).toEqual({ ax: 1, ay: 1 })
    expect(presetAnchor('center')).toEqual({ ax: 0.5, ay: 0.5 })
    expect(presetAnchor('middle-left')).toEqual({ ax: 0, ay: 0.5 })
    expect(presetAnchor('top-center')).toEqual({ ax: 0.5, ay: 1 })
  })
})

describe('placeStamp', () => {
  it('centers an unrotated stamp on an unrotated page', () => {
    const p = placeStamp(600, 800, 0, 'center', 100, 20, 0, 24)
    expect(p).toEqual({ x: 250, y: 390, drawAngle: 0 })
  })

  it('anchors bottom-left with margin', () => {
    const p = placeStamp(600, 800, 0, 'bottom-left', 100, 20, 0, 24)
    expect(p).toEqual({ x: 24, y: 24, drawAngle: 0 })
  })

  it('anchors top-right so the stamp box stays inside the page', () => {
    const p = placeStamp(600, 800, 0, 'top-right', 100, 20, 0, 24)
    expect(p).toEqual({ x: 600 - 24 - 100, y: 800 - 24 - 20, drawAngle: 0 })
  })

  it('compensates the draw angle for page /Rotate', () => {
    expect(placeStamp(600, 800, 90, 'center', 100, 20, 0, 24).drawAngle).toBe(90)
    expect(placeStamp(600, 800, 270, 'center', 100, 20, 45, 24).drawAngle).toBe(315)
  })

  it('keeps the stamp center at the viewed center regardless of /Rotate', () => {
    // For a centered stamp the anchor is the stamp midpoint: on a /Rotate 90
    // page the viewed center (vw/2, vh/2) maps back to user (w/2, h/2).
    const p = placeStamp(600, 800, 90, 'center', 100, 20, 0, 24)
    // anchor offset rotated by 0° is (50,10); viewed target (400,300)
    // → viewed origin (350,290) → user x = 600−290, y = 350
    expect(p.x).toBeCloseTo(310)
    expect(p.y).toBeCloseTo(350)
  })
})

describe('needsUnicodeFont', () => {
  it('accepts WinAnsi text', () => {
    expect(needsUnicodeFont('CONFIDENTIAL')).toBe(false)
    expect(needsUnicodeFont('Café — “dräft” • 50%')).toBe(false)
  })
  it('flags CJK and other non-WinAnsi text', () => {
    expect(needsUnicodeFont('機密')).toBe(true)
    expect(needsUnicodeFont('Проект')).toBe(true)
    expect(needsUnicodeFont('डраफ्ट')).toBe(true)
  })
})
