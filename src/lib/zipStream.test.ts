import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { clampZipLevel, streamZip } from './zipStream'

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

  it('stores without compressing at level 0 and round-trips byte-identically', async () => {
    const repetitive = new Uint8Array(50_000).fill(65)
    const stored = await streamZip(
      [{ name: 'big.txt', blob: new Blob([repetitive]) }],
      undefined,
      8 * 1024 * 1024,
      0,
    )
    // Stored output carries the full payload plus zip container overhead.
    expect(stored.size).toBeGreaterThan(repetitive.length)
    const entries = unzipSync(await blobBytes(stored))
    expect(entries['big.txt']).toEqual(repetitive)
  })

  it('compresses better at level 9 than at level 0', async () => {
    const text = new TextEncoder().encode('the quick brown fox jumps over '.repeat(4000))
    const blob = new Blob([text])
    const [lo, hi] = await Promise.all([
      streamZip([{ name: 't.txt', blob }], undefined, 8 * 1024 * 1024, 0),
      streamZip([{ name: 't.txt', blob }], undefined, 8 * 1024 * 1024, 9),
    ])
    expect(hi.size).toBeLessThan(lo.size / 10)
  })

  it('clamps out-of-range levels instead of throwing', async () => {
    expect(clampZipLevel(99)).toBe(9)
    expect(clampZipLevel(-3)).toBe(0)
    expect(clampZipLevel(Number.NaN)).toBe(6)
    const out = await streamZip(
      [{ name: 'a.txt', blob: new Blob(['hi']) }],
      undefined,
      8 * 1024 * 1024,
      99,
    )
    const entries = unzipSync(await blobBytes(out))
    expect(new TextDecoder().decode(entries['a.txt'])).toBe('hi')
  })
})
