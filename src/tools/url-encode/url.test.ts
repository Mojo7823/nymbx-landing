import { describe, expect, it } from 'vitest'
import { decodeUrlText, encodeUrlText, parseUrl, punycodeToUnicode } from './url'

describe('encodeUrlText', () => {
  it('component mode encodes every reserved character', () => {
    expect(encodeUrlText('a=1&b=2 c/d?', 'component')).toBe('a%3D1%26b%3D2%20c%2Fd%3F')
  })

  it('component mode encodes UTF-8 text (CJK, emoji)', () => {
    expect(encodeUrlText('中文 🎉', 'component')).toBe('%E4%B8%AD%E6%96%87%20%F0%9F%8E%89')
  })

  it('full-URL mode keeps URL structure but encodes spaces and unicode', () => {
    expect(encodeUrlText('https://example.com/a b?q=中文', 'full')).toBe(
      'https://example.com/a%20b?q=%E4%B8%AD%E6%96%87',
    )
  })
})

describe('decodeUrlText', () => {
  it('round-trips component-encoded UTF-8 exactly', () => {
    const original = 'key=值&x=🎉 100% / done'
    expect(decodeUrlText(encodeUrlText(original, 'component'), 'component')).toBe(original)
  })

  it('full-URL mode leaves encoded reserved characters intact', () => {
    expect(decodeUrlText('a%2Fb%20c', 'full')).toBe('a%2Fb c')
  })

  it('reports the position of a broken percent escape', () => {
    expect(() => decodeUrlText('abc%2', 'component')).toThrow('character 4')
  })

  it('rejects percent sequences that are not valid UTF-8', () => {
    expect(() => decodeUrlText('%E0%A4', 'component')).toThrow(/UTF-8/)
  })
})

describe('parseUrl', () => {
  it('breaks a URL into all of its parts', () => {
    const p = parseUrl(
      'https://user:pw@example.com:8443/path/to%20page?a=1&b=two%20words#sec%20tion',
    )
    expect(p.protocol).toBe('https')
    expect(p.username).toBe('user')
    expect(p.password).toBe('pw')
    expect(p.hostname).toBe('example.com')
    expect(p.port).toBe('8443')
    expect(p.pathname).toBe('/path/to%20page')
    expect(p.decodedPathname).toBe('/path/to page')
    expect(p.params).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: 'two words' },
    ])
    expect(p.hash).toBe('sec%20tion')
    expect(p.decodedHash).toBe('sec tion')
    expect(p.assumedProtocol).toBe(false)
  })

  it('lists repeated query keys separately, in order', () => {
    expect(parseUrl('https://x.test/?a=1&a=2&b=3').params).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
      { key: 'b', value: '3' },
    ])
  })

  it('decodes + as a space inside query values', () => {
    expect(parseUrl('https://x.test/?q=two+words').params).toEqual([
      { key: 'q', value: 'two words' },
    ])
  })

  it('shows IDN hosts both ways when the input is unicode', () => {
    const p = parseUrl('https://bücher.example/')
    expect(p.hostname).toBe('xn--bcher-kva.example')
    expect(p.unicodeHostname).toBe('bücher.example')
  })

  it('shows IDN hosts both ways when the input is already punycode', () => {
    const p = parseUrl('https://xn--bcher-kva.example/')
    expect(p.hostname).toBe('xn--bcher-kva.example')
    expect(p.unicodeHostname).toBe('bücher.example')
  })

  it('round-trips a CJK domain through punycode', () => {
    const p = parseUrl('https://中文.tw/')
    expect(p.hostname.startsWith('xn--')).toBe(true)
    expect(p.unicodeHostname).toBe('中文.tw')
  })

  it('omits the unicode variant for pure-ASCII hosts', () => {
    expect(parseUrl('https://example.com/').unicodeHostname).toBeUndefined()
  })

  it('assumes https:// when the scheme is missing', () => {
    const p = parseUrl('example.com/x?y=1')
    expect(p.assumedProtocol).toBe(true)
    expect(p.protocol).toBe('https')
    expect(p.hostname).toBe('example.com')
  })

  it('treats host:port shorthand as a host, not a scheme', () => {
    const p = parseUrl('localhost:3000/api')
    expect(p.assumedProtocol).toBe(true)
    expect(p.hostname).toBe('localhost')
    expect(p.port).toBe('3000')
  })

  it('omits default ports and empty parts', () => {
    const p = parseUrl('https://example.com/')
    expect(p.port).toBeUndefined()
    expect(p.username).toBeUndefined()
    expect(p.password).toBeUndefined()
    expect(p.hash).toBeUndefined()
    expect(p.params).toEqual([])
  })

  it('throws a graceful error on malformed URLs', () => {
    expect(() => parseUrl('http://')).toThrow(/valid URL/i)
    expect(() => parseUrl('http://exa mple.com/')).toThrow(/valid URL/i)
    expect(() => parseUrl('   ')).toThrow(/empty/i)
  })
})

describe('punycodeToUnicode', () => {
  it('decodes punycode labels and leaves ASCII labels alone', () => {
    expect(punycodeToUnicode('xn--bcher-kva.example.com')).toBe('bücher.example.com')
  })

  it('decodes labels with mixed basic and extended code points', () => {
    expect(punycodeToUnicode('xn--maana-pta.com')).toBe('mañana.com')
  })

  it('returns invalid punycode labels unchanged', () => {
    expect(punycodeToUnicode('xn--!!!.com')).toBe('xn--!!!.com')
  })
})
