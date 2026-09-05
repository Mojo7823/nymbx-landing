import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../../lib/pdfGeometry'
import { exportPlan, type PathDraw, type TextDraw } from './exportPlan'
import {
  createCheck,
  createImage,
  createInk,
  createText,
  CHECK_PATH,
  type SignObject,
} from './objects'
import type { InkStroke } from './ink'

const A4: PageGeometry = { width: 595, height: 842, rotate: 0 }
const pageAt = (rotate: number): PageGeometry[] => [{ ...A4, rotate }]

describe('exportPlan — text', () => {
  const text = createText(0, 100, 200, { text: 'Hello', size: 20, color: '#ff0000' })

  it('anchors at the first-line baseline on an unrotated page', () => {
    const [call] = exportPlan([text], pageAt(0)) as TextDraw[]
    expect(call).toMatchObject({
      type: 'text',
      page: 0,
      x: 100,
      y: 842 - (200 + 16),
      size: 20,
      lineHeight: 25,
      color: '#ff0000',
      rotate: 0,
    })
  })

  it('maps the baseline through every rotation and asks for an upright draw', () => {
    const baseline = 216
    const cases: [number, number, number][] = [
      // rotate, expected x, expected y
      [0, 100, 842 - baseline],
      [90, baseline, 100],
      [180, 595 - 100, baseline],
      [270, 595 - baseline, 842 - 100],
    ]
    for (const [rotate, x, y] of cases) {
      const [call] = exportPlan([text], pageAt(rotate))
      expect({ rotate: call.rotate, x: call.x, y: call.y }).toEqual({ rotate, x, y })
    }
  })

  it('skips empty text', () => {
    expect(exportPlan([createText(0, 0, 0, { text: '' })], pageAt(0))).toHaveLength(0)
  })

  it('keeps multi-line text as one call with a line height', () => {
    const multi = createText(0, 10, 10, { text: 'a\nb', size: 12 })
    const [call] = exportPlan([multi], pageAt(0)) as TextDraw[]
    expect(call.text).toBe('a\nb')
    expect(call.lineHeight).toBe(15)
  })
})

describe('exportPlan — image', () => {
  const img = createImage(0, 50, 60, 'img-1', 200, 100)

  it('anchors at the bottom-left of the box (unrotated)', () => {
    const [call] = exportPlan([img], pageAt(0))
    expect(call).toMatchObject({
      type: 'image',
      imageId: 'img-1',
      x: 50,
      y: 842 - 160,
      width: 200,
      height: 100,
      rotate: 0,
    })
  })

  it('maps the anchor for a 90° page', () => {
    // viewed bottom-left of the box is (50, 160); on a 90° page the viewed
    // page box is 842 x 595, so vyUp = 595 - 160 = 435 → user (595-435, 50).
    const [call] = exportPlan([img], pageAt(90))
    expect({ x: call.x, y: call.y, rotate: call.rotate }).toEqual({ x: 160, y: 50, rotate: 90 })
  })
})

describe('exportPlan — ink', () => {
  const stroke: InkStroke = [
    { x: 100, y: 100, p: 0.5 },
    { x: 140, y: 120, p: 0.5 },
    { x: 180, y: 100, p: 0.5 },
  ]
  const ink = createInk(0, [stroke], 6, '#0000ff')

  it('anchors at the box top-left and fills the path', () => {
    const [call] = exportPlan([ink], pageAt(0)) as PathDraw[]
    expect(call.type).toBe('path')
    expect(call.x).toBe(97)
    expect(call.y).toBe(842 - 97)
    expect(call.scale).toBe(1)
    expect(call.fill).toBe('#0000ff')
    expect(call.stroke).toBeNull()
    expect(call.strokeWidth).toBe(0)
    expect(call.path.startsWith('M')).toBe(true)
  })

  it('maps the anchor for 180° and 270° pages', () => {
    const [at180] = exportPlan([ink], pageAt(180))
    expect({ x: at180.x, y: at180.y, rotate: at180.rotate }).toEqual({
      x: 595 - 97,
      y: 97,
      rotate: 180,
    })
    const [at270] = exportPlan([ink], pageAt(270))
    expect({ x: at270.x, y: at270.y, rotate: at270.rotate }).toEqual({
      x: 595 - 97,
      y: 842 - 97,
      rotate: 270,
    })
  })

  it('skips ink with no strokes', () => {
    expect(exportPlan([{ ...ink, strokes: [] }], pageAt(0))).toHaveLength(0)
  })
})

describe('exportPlan — checkmark', () => {
  const check = createCheck(0, 300, 400, 48, '#008000')

  it('scales the 24-unit path and strokes it', () => {
    const [call] = exportPlan([check], pageAt(0)) as PathDraw[]
    expect(call).toMatchObject({
      type: 'path',
      path: CHECK_PATH,
      scale: 2,
      fill: null,
      stroke: '#008000',
      strokeWidth: 5,
      x: 300,
      y: 842 - 400,
      rotate: 0,
    })
  })
})

describe('exportPlan — document level', () => {
  const objects: SignObject[] = [
    createCheck(0, 10, 10),
    createCheck(1, 10, 10),
    createText(0, 20, 20, { text: 'x' }),
  ]
  const pages: PageGeometry[] = [A4, { width: 842, height: 595, rotate: 0 }]

  it('keeps z-order and uses each object page', () => {
    const plan = exportPlan(objects, pages)
    expect(plan.map((c) => c.page)).toEqual([0, 1, 0])
    expect(plan[1].y).toBe(595 - 10)
  })

  it('drops objects pointing at a missing page', () => {
    expect(exportPlan([createCheck(9, 0, 0)], pages)).toHaveLength(0)
  })

  it('is independent of any editor zoom (pure function of the objects)', () => {
    expect(exportPlan(objects, pages)).toEqual(exportPlan(objects, pages))
  })
})
