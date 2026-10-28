import { describe, expect, it } from 'vitest'
import { analyze, parseResponseText, parseTarget, type ScanStatus } from './scan'

function snapshot(headers: Record<string, string>, path = '/', body = '') {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const setCookies = headers['Set-Cookie'] ? [headers['Set-Cookie']] : []
  return { headers: map, setCookies, path, body }
}

describe('analyze', () => {
  // Same cases as check_test.go in github.com/Mojo7823/phpscan.
  const cases: [string, Record<string, string>, string, string, ScanStatus, boolean][] = [
    ['old branch', { 'X-Powered-By': 'PHP/7.4.33' }, '/', '', 'vulnerable', false],
    ['supported but unpatched', { 'X-Powered-By': 'PHP/8.3.10' }, '/', '', 'vulnerable', false],
    ['last unpatched release', { 'X-Powered-By': 'PHP/8.2.34' }, '/', '', 'vulnerable', false],
    ['first fixed release', { 'X-Powered-By': 'PHP/8.2.35' }, '/', '', 'patched', false],
    ['patched', { 'X-Powered-By': 'PHP/8.3.36' }, '/', '', 'patched', false],
    ['patched distro build', { 'X-Powered-By': 'PHP/8.4.27-1+deb13u1' }, '/', '', 'patched', false],
    [
      'distro may backport',
      { 'X-Powered-By': 'PHP/8.1.2-1ubuntu2.18' },
      '/',
      '',
      'likely_vulnerable',
      false,
    ],
    ['newer branch', { 'X-Powered-By': 'PHP/8.6.0' }, '/', '', 'unknown', false],
    ['next major', { 'X-Powered-By': 'PHP/9.0.0' }, '/', '', 'unknown', false],
    ['server header', { Server: 'Apache/2.4.41 (Ubuntu) PHP/7.4.3' }, '/', '', 'vulnerable', false],
    ['hidden version', { 'Set-Cookie': 'PHPSESSID=abc; path=/' }, '/', '', 'unknown', false],
    ['router login page', {}, '/', '<form action="login.php">', 'unknown', false],
    ['pan-os', {}, '/php/login.php', '', 'unknown', true],
    ['no php', { Server: 'nginx' }, '/', '<html>hi</html>', 'no_php_detected', false],
  ]

  it.each(cases)('%s', (_name, headers, path, body, status, product) => {
    const result = analyze(snapshot(headers, path, body))
    expect(result.status).toBe(status)
    expect(result.product !== undefined).toBe(product)
  })

  it('takes the version from X-Powered-By before Server and keeps both as evidence', () => {
    const result = analyze(
      snapshot({ 'X-Powered-By': 'PHP/8.5.12', Server: 'Apache PHP/7.4.3' }, '/', ''),
    )
    expect(result).toMatchObject({ status: 'patched', phpVersion: '8.5.12' })
    expect(result.evidence).toEqual(['X-Powered-By: PHP/8.5.12', 'Server: Apache PHP/7.4.3'])
  })

  it('adds firmware advice for an affected appliance unless it is patched', () => {
    const appliance = analyze(snapshot({}, '/', '<title>FortiSOAR</title>'))
    expect(appliance.advice).toContain('Fortinet FortiSOAR: install the fixed firmware')
    expect(appliance.advisory).toBe('https://www.fortiguard.com/psirt')

    const patched = analyze(snapshot({ 'X-Powered-By': 'PHP/8.4.27' }, '/', 'fortiddos'))
    expect(patched.status).toBe('patched')
    expect(patched.advice).not.toContain('firmware')
  })
})

describe('parseResponseText', () => {
  it('reads the final response of curl -iL output', () => {
    const text = [
      'HTTP/1.1 301 Moved Permanently',
      'Server: Apache PHP/7.4.3',
      'Location: https://example.com/',
      '',
      'HTTP/2 200',
      'x-powered-by: PHP/8.3.36',
      'set-cookie: theme=dark',
      'set-cookie: PHPSESSID=1; path=/',
      '',
      '<a href="/a.php">a</a>',
    ].join('\r\n')
    const parsed = parseResponseText(text, '/index.php')
    expect(parsed.headers.get('x-powered-by')).toBe('PHP/8.3.36')
    expect(parsed.headers.has('server')).toBe(false)
    expect(parsed.setCookies).toEqual(['theme=dark', 'PHPSESSID=1; path=/'])
    expect(parsed.body).toBe('<a href="/a.php">a</a>')
    expect(parsed.path).toBe('/index.php')
  })

  it('reads devtools header copies without a status line, skipping HTTP/2 pseudo-headers', () => {
    const parsed = parseResponseText(':status: 200\nserver: nginx\nx-powered-by: PHP/8.2.20\n')
    expect(analyze(parsed)).toMatchObject({ status: 'vulnerable', phpVersion: '8.2.20' })
  })

  it('reads curl -v response lines', () => {
    const parsed = parseResponseText('< HTTP/1.1 200 OK\n< X-Powered-By: PHP/8.5.11\n<\n')
    expect(analyze(parsed).status).toBe('vulnerable')
  })

  it('treats text without headers as page source', () => {
    const parsed = parseResponseText('<!doctype html><form action="login.php">')
    expect(parsed.headers.size).toBe(0)
    expect(analyze(parsed).status).toBe('unknown')
  })
})

describe('parseTarget', () => {
  it('adds https:// to a bare host', () => {
    expect(parseTarget('  www.example.com/path ').href).toBe('https://www.example.com/path')
  })

  it.each(['http://example.com:80', 'https://example.com:443', 'https://example.com:80'])(
    'accepts standard web port %s',
    (raw) => {
      expect(() => parseTarget(raw)).not.toThrow()
    },
  )

  it.each([
    ['example.com:8080', /ports \(80 and 443\)/],
    ['ftp://example.com', /website address/],
    ['https://user:pw@example.com', /user name and password/],
    ['http://exa mple.com', /website address/],
  ])('rejects %s', (raw, message) => {
    expect(() => parseTarget(raw)).toThrow(message)
  })
})
