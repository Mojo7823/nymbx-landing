import { describe, expect, it } from 'vitest'
import { hashText, hmacText, normalizeExpected, parseHexKey, type AlgorithmId } from './hash'

// Published digest vectors: NIST (SHA-1/2), RFC 1321 (MD5), NIST FIPS 202
// (SHA-3) and the official BLAKE3 test vectors — all cross-checked against
// independent implementations (Python hashlib, the Rust blake3 crate).
const ABC_HEX: Record<AlgorithmId, string> = {
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha512:
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  md5: '900150983cd24fb0d6963f7d28e17f72',
  'sha3-256': '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
  'sha3-512':
    'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
  blake3: '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
}

const EMPTY_HEX: Record<AlgorithmId, string> = {
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  sha512:
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
  sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
  md5: 'd41d8cd98f00b204e9800998ecf8427e',
  'sha3-256': 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
  'sha3-512':
    'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26',
  blake3: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
}

describe('hashText', () => {
  it('hashes "abc" to the published vectors for every algorithm', async () => {
    for (const algorithm of Object.keys(ABC_HEX) as AlgorithmId[]) {
      expect(await hashText('abc', algorithm, 'hex'), algorithm).toBe(ABC_HEX[algorithm])
    }
  })

  it('hashes the empty string to the known constants', async () => {
    for (const algorithm of Object.keys(EMPTY_HEX) as AlgorithmId[]) {
      expect(await hashText('', algorithm, 'hex'), algorithm).toBe(EMPTY_HEX[algorithm])
    }
  })

  it('encodes text as UTF-8 before hashing', async () => {
    // Matches Python: hashlib.sha256('café 中文'.encode('utf-8'))
    expect(await hashText('café 中文', 'sha256', 'hex')).toBe(
      '0e206b41c05c5b1a1b06c3d71c7d7aec98939f12cad1dedce1f8bfb128aff8fd',
    )
  })

  it('renders the same digest bytes as base64', async () => {
    // Matches Python: base64.b64encode(hashlib.sha256(b'abc').digest())
    expect(await hashText('abc', 'sha256', 'base64')).toBe(
      'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    )
  })
})

describe('hmacText', () => {
  // RFC 4231 test case 1 / RFC 2202 case 1: key = 0x0b repeated, "Hi There".
  const key0b = (bytes: number) => '0b'.repeat(bytes)

  it('matches RFC 4231 test case 1 (hex key)', async () => {
    expect(await hmacText('Hi There', 'sha256', key0b(20), 'hex', 'hex')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
    expect(await hmacText('Hi There', 'sha512', key0b(20), 'hex', 'hex')).toBe(
      '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde' +
        'daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    )
  })

  it('matches RFC 2202 case 1 for SHA-1 and MD5 (hex key)', async () => {
    expect(await hmacText('Hi There', 'sha1', key0b(20), 'hex', 'hex')).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00',
    )
    expect(await hmacText('Hi There', 'md5', key0b(16), 'hex', 'hex')).toBe(
      '9294727a3638bb1c13f48ef8158bfc9d',
    )
  })

  it('matches RFC 4231 test case 2 (text key "Jefe")', async () => {
    const data = 'what do ya want for nothing?'
    expect(await hmacText(data, 'sha256', 'Jefe', 'text', 'hex')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
    expect(await hmacText(data, 'sha512', 'Jefe', 'text', 'hex')).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554' +
        '9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    )
    expect(await hmacText(data, 'sha1', 'Jefe', 'text', 'hex')).toBe(
      'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
    )
    expect(await hmacText(data, 'md5', 'Jefe', 'text', 'hex')).toBe(
      '750c783e6ab0b503eaa86e310a5db738',
    )
  })

  it('matches RFC 4231 test case 6 (key longer than the block size)', async () => {
    const data = 'Test Using Larger Than Block-Size Key - Hash Key First'
    expect(await hmacText(data, 'sha256', 'aa'.repeat(131), 'hex', 'hex')).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    )
  })

  it('computes HMAC over SHA-3 (verified against Python hmac)', async () => {
    const data = 'what do ya want for nothing?'
    expect(await hmacText(data, 'sha3-256', 'Jefe', 'text', 'hex')).toBe(
      'c7d4072e788877ae3596bbb0da73b887c9171f93095b294ae857fbe2645e1ba5',
    )
    expect(await hmacText(data, 'sha3-512', 'Jefe', 'text', 'hex')).toBe(
      '5a4bfeab6166427c7a3647b747292b8384537cdb89afb3bf5665e4c5e709350b' +
        '287baec921fd7ca0ee7a0c31d022a95e1fc92ba9d77df883960275beb4e62024',
    )
  })

  it('HMAC-BLAKE3 is deterministic, key-sensitive and differs from plain BLAKE3', async () => {
    const a = await hmacText('abc', 'blake3', 'secret', 'text', 'hex')
    expect(await hmacText('abc', 'blake3', 'secret', 'text', 'hex')).toBe(a)
    expect(await hmacText('abc', 'blake3', 'secreu', 'text', 'hex')).not.toBe(a)
    expect(a).not.toBe(ABC_HEX.blake3)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('encodes text keys as UTF-8 (verified against Python hmac)', async () => {
    // Python: hmac.new('café'.encode('utf-8'), b'data', hashlib.sha256)
    expect(await hmacText('data', 'sha256', 'café', 'text', 'hex')).toBe(
      '6edf1f8176a89c6512f42223d1a4d819f102c015bcaad8e0f288a901918c1e0d',
    )
  })

  it('treats a hex key and the same characters as text as different keys', async () => {
    const asHex = await hmacText('data', 'sha256', 'abcd', 'hex', 'hex')
    const asText = await hmacText('data', 'sha256', 'abcd', 'text', 'hex')
    expect(asHex).not.toBe(asText)
    // Hex "abcd" is bytes 0xAB 0xCD — two bytes, not the four letters.
    expect(asHex).toBe(await hmacText('data', 'sha256', 'AB CD', 'hex', 'hex'))
  })

  it('renders HMAC output as base64 from the same bytes', async () => {
    const hex = await hmacText('Hi There', 'sha256', key0b(20), 'hex', 'hex')
    const base64 = await hmacText('Hi There', 'sha256', key0b(20), 'hex', 'base64')
    const bytes = Uint8Array.from(hex.match(/../g)!.map((pair) => parseInt(pair, 16)))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    expect(base64).toBe(btoa(binary))
  })
})

describe('parseHexKey', () => {
  it('decodes hex into bytes, tolerating case and whitespace', () => {
    expect([...parseHexKey('0a FF 10')]).toEqual([0x0a, 0xff, 0x10])
  })

  it('rejects empty, non-hex and odd-length input with clear errors', () => {
    expect(() => parseHexKey('   ')).toThrow(/empty/i)
    expect(() => parseHexKey('0g')).toThrow(/0–9/)
    expect(() => parseHexKey('abc')).toThrow(/even/i)
  })
})

describe('normalizeExpected', () => {
  it('lowercases hex and keeps only the first token', () => {
    expect(normalizeExpected('  BA7816BF  some-file.txt \n', 'hex')).toBe('ba7816bf')
  })

  it('keeps base64 case-sensitive', async () => {
    const digest = await hashText('abc', 'sha256', 'base64')
    expect(normalizeExpected(` ${digest} `, 'base64')).toBe(digest)
    expect(normalizeExpected(digest.toLowerCase(), 'base64')).not.toBe(digest)
  })
})
