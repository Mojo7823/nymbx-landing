import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { streamZip } from './zipStream'

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('streamZip', () => {
  it('round-trips file contents byte-identically', async () => {
    const a = new Uint8Array([1, 2, 3, 255, 0, 42])
    const b = new TextEncoder().encode('hello zip world')
    const out = await streamZip([
      { name: 'a.bin', blob: new Blob([a]) },
      { name: 'b.txt', blob: new Blob([b]) },
    ])
    const entries = unzipSync(await blobBytes(out))
    expect(Object.keys(entries).sort()).toEqual(['a.bin', 'b.txt'])
    expect(Array.from(entries['a.bin'])).toEqual(Array.from(a))
    expect(Array.from(entries['b.txt'])).toEqual(Array.from(b))
  })

  it('compresses compressible entries (deflate, not store)', async () => {
    const repetitive = new Uint8Array(100_000).fill(65)
    const out = await streamZip([{ name: 'big.txt', blob: new Blob([repetitive]) }])
    expect(out.size).toBeLessThan(repetitive.length / 10)
  })

  it('reports monotonically increasing progress up to the total size', async () => {
    const data = new Uint8Array(3 * 1024 * 1024)
    const seen: number[] = []
    await streamZip(
      [{ name: 'x.bin', blob: new Blob([data]) }],
      (done) => seen.push(done),
      1024 * 1024,
    )
    expect(seen.length).toBeGreaterThanOrEqual(3)
    expect([...seen].sort((x, y) => x - y)).toEqual(seen)
    expect(seen.at(-1)).toBe(data.length)
  })

  it('handles empty files and unicode names', async () => {
    const out = await streamZip([{ name: '空 ファイル ✓.txt', blob: new Blob([]) }])
    const entries = unzipSync(await blobBytes(out))
    expect(entries['空 ファイル ✓.txt']).toEqual(new Uint8Array(0))
  })
})
