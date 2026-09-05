import { describe, expect, it } from 'vitest'
import { hashBlob, type AlgorithmId } from './hashEngine'

const ALL: AlgorithmId[] = ['sha256', 'sha1', 'sha512', 'sha384', 'md5', 'blake2b', 'crc32']

// Published test vectors (NIST / RFC 1321 / RFC 3174; CRC32 is the zlib value;
// SHA-384 and BLAKE2b-512 cross-checked against coreutils sha384sum / b2sum).
const EMPTY = {
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
  sha512:
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
  sha384:
    '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
  md5: 'd41d8cd98f00b204e9800998ecf8427e',
  blake2b:
    '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce',
  crc32: '00000000',
}

const ABC = {
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha512:
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  sha384:
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  md5: '900150983cd24fb0d6963f7d28e17f72',
  blake2b:
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
  crc32: '352441c2',
}

describe('hashBlob', () => {
  it('hashes the empty file to the known constants', async () => {
    expect(await hashBlob(new Blob([]), ALL)).toEqual(EMPTY)
  })

  it('hashes "abc" to the published test vectors', async () => {
    expect(await hashBlob(new Blob(['abc']), ALL)).toEqual(ABC)
  })

  it('computes only the requested algorithms', async () => {
    const result = await hashBlob(new Blob(['abc']), ['sha256'])
    expect(result).toEqual({ sha256: ABC.sha256 })
  })

  it('produces identical hashes when the blob is read in small chunks', async () => {
    const data = 'The quick brown fox jumps over the lazy dog'.repeat(100)
    const whole = await hashBlob(new Blob([data]), ALL)
    const chunked = await hashBlob(new Blob([data]), ALL, undefined, 7)
    expect(chunked).toEqual(whole)
  })

  it('reports monotonically increasing progress up to the blob size', async () => {
    const blob = new Blob(['x'.repeat(100)])
    const seen: number[] = []
    await hashBlob(blob, ['sha256'], (bytes) => seen.push(bytes), 32)
    expect(seen.at(-1)).toBe(100)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThan(seen[i - 1]!)
    }
  })
})
