import { describe, expect, it, vi } from 'vitest'
import { findByteSequence } from './search'

describe('windowed byte search', () => {
  it('finds a sequence spanning two chunks', async () => {
    const source = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])])
    await expect(
      findByteSequence(source, new Uint8Array([3, 4, 5]), 0, { chunkSize: 4 }),
    ).resolves.toEqual({ offset: 3, wrapped: false })
  })

  it('wraps to the beginning after the starting offset', async () => {
    const source = new Blob([new Uint8Array([9, 8, 7, 6, 5, 4])])
    await expect(
      findByteSequence(source, new Uint8Array([9, 8]), 3, { chunkSize: 3 }),
    ).resolves.toEqual({ offset: 0, wrapped: true })
  })

  it('reports bounded progress and returns null for no match', async () => {
    const progress = vi.fn()
    const source = new Blob([new Uint8Array(17)])
    await expect(
      findByteSequence(source, new Uint8Array([1, 2]), 0, {
        chunkSize: 5,
        onProgress: progress,
      }),
    ).resolves.toBeNull()
    expect(progress).toHaveBeenLastCalledWith(17, 17)
  })
})
