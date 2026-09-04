import { describe, expect, it } from 'vitest'
import { detectBytes } from './detect'

describe('magic-byte detection', () => {
  it.each([
    ['PDF', [0x25, 0x50, 0x44, 0x46, 0x2d], 'pdf'],
    ['ZIP', [0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0], 'zip'],
    ['ELF', [0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 'elf'],
    ['EXE', [0x4d, 0x5a, ...Array<number>(70).fill(0)], 'exe'],
  ])('identifies %s by content', async (_label, signature, extension) => {
    await expect(detectBytes(new Uint8Array(signature as number[]))).resolves.toMatchObject({
      ext: extension,
    })
  })

  it('returns undefined for unknown bytes', async () => {
    await expect(detectBytes(new Uint8Array([1, 2, 3, 4]))).resolves.toBeUndefined()
  })

  it('identifies a real PNG sample', async () => {
    const binary = atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    )
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    await expect(detectBytes(bytes)).resolves.toMatchObject({ ext: 'png', mime: 'image/png' })
  })
})
