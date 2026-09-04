import { describe, expect, it } from 'vitest'
import {
  buildIco,
  buildManifest,
  buildSnippet,
  OUTPUT_FILES,
  parseIco,
  squareCrop,
} from './favicon'

function fakePng(payload: string): Uint8Array {
  // Real PNG magic + deterministic body (sizes come from the container test).
  const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const body = new TextEncoder().encode(payload)
  const out = new Uint8Array(head.length + body.length)
  out.set(head)
  out.set(body, head.length)
  return out
}

describe('ICO container', () => {
  it('packs PNGs with a correct directory (16/32/48)', () => {
    const ico = buildIco([
      { size: 16, png: fakePng('a') },
      { size: 32, png: fakePng('bb') },
      { size: 48, png: fakePng('ccc') },
    ])
    const entries = parseIco(ico)
    expect(entries.map((e) => e.size)).toEqual([16, 32, 48])
    expect(entries.every((e) => e.hasPngMagic)).toBe(true)
    expect(entries.map((e) => e.bytes)).toEqual([9, 10, 11])
  })

  it('rejects empty sets and non-ICO bytes', () => {
    expect(() => buildIco([])).toThrow(/at least one/)
    expect(() => parseIco(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(/not an ico/i)
    expect(() => parseIco(new Uint8Array([0, 0, 1, 0]))).toThrow()
  })
})

describe('manifest and snippet', () => {
  it('emits valid JSON whose icon paths match the zip layout', () => {
    const manifest = JSON.parse(buildManifest('  Cool App  ')) as {
      name: string
      icons: Array<{ src: string; sizes: string }>
    }
    expect(manifest.name).toBe('Cool App')
    expect(manifest.icons.map((i) => i.src).sort()).toEqual(
      [OUTPUT_FILES.icon192, OUTPUT_FILES.icon512].sort(),
    )
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512'])
  })

  it('falls back to a default app name', () => {
    expect((JSON.parse(buildManifest('   ')) as { name: string }).name).toBe('My App')
  })

  it('references exactly the files the zip contains', () => {
    const snippet = buildSnippet()
    for (const file of [OUTPUT_FILES.ico, OUTPUT_FILES.appleTouch, OUTPUT_FILES.manifest]) {
      expect(snippet).toContain(`/${file}`)
    }
  })
})

describe('square crop math', () => {
  it('center-crops landscape and portrait sources, passes squares through', () => {
    expect(squareCrop(1200, 800)).toEqual({ x: 200, y: 0, edge: 800, cropped: true })
    expect(squareCrop(800, 1200)).toEqual({ x: 0, y: 200, edge: 800, cropped: true })
    expect(squareCrop(512, 512)).toEqual({ x: 0, y: 0, edge: 512, cropped: false })
  })
})
