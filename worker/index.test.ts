// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import worker, { assertPublicHost, scan, type Env } from './index'

function reply(status: number, headers: Record<string, string> = {}, body = ''): Response {
  return new Response(status >= 300 && status < 400 ? null : body, { status, headers })
}

describe('scan', () => {
  it('follows same-host redirects and analyzes the final page', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply(301, { Location: '/login.php', 'X-Powered-By': 'PHP/7.4.3' }))
      .mockResolvedValueOnce(reply(200, { 'X-Powered-By': 'PHP/8.3.36' }))
    const result = await scan(new URL('https://example.com/'), fetcher)
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/',
      'https://example.com/login.php',
    ])
    expect(result).toMatchObject({ url: 'https://example.com/', status: 'patched' })
    expect(result.evidence).toContain('page served from /login.php')
  })

  it.each([
    ['another host', 'https://evil.example/'],
    ['a non-web port', 'https://example.com:8080/'],
  ])('stays on the response when a redirect goes to %s', async (_label, location) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply(302, { Location: location, Server: 'Apache PHP/7.4.3' }))
    const result = await scan(new URL('https://example.com/'), fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('vulnerable')
  })

  it('sends at most five requests for a redirect loop', async () => {
    const fetcher = vi.fn(async () => reply(302, { Location: '/again' }))
    const result = await scan(new URL('https://example.com/'), fetcher)
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(result.status).toBe('no_php_detected')
  })

  it('reads at most 64 KB of the body', async () => {
    const page = 'a'.repeat(64 * 1024) + '<a href="/x.php">'
    const result = await scan(new URL('https://example.com/'), async () => reply(200, {}, page))
    expect(result.status).toBe('no_php_detected')
  })

  it('reports a failed request as unreachable', async () => {
    const result = await scan(new URL('https://example.com/'), async () => {
      throw new TypeError('Network connection lost.')
    })
    expect(result).toMatchObject({ status: 'unreachable', error: 'Network connection lost.' })
  })

  it("reports Cloudflare's origin-error page as unreachable, not as the site", async () => {
    const page = '<title>Invalid SSL certificate</title><a href="/cdn-cgi/x.php">'
    const result = await scan(new URL('https://example.com/'), async () => reply(526, {}, page))
    expect(result.status).toBe('unreachable')
    expect(result.error).toMatch(/^Could not connect \(HTTP 526\)/)
  })
})

describe('assertPublicHost', () => {
  it.each(['example.com', 'www.example.co.uk', '8.8.8.8', '[2606:4700::1111]'])(
    'accepts %s',
    (host) => {
      expect(() => assertPublicHost(host)).not.toThrow()
    },
  )

  it.each([
    'localhost',
    'intranet',
    'router.local',
    'app.localhost',
    'nas.home.arpa',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.1',
    '224.0.0.1',
    '[::1]',
    '[fd00::1]',
    '[::ffff:a00:1]',
    '[64:ff9b::a00:1]',
  ])('rejects %s', (host) => {
    expect(() => assertPublicHost(host)).toThrow('Only public websites')
  })

  it('rejects IPv4 shorthands once URL normalizes them', () => {
    expect(() => assertPublicHost(new URL('http://2130706433/').hostname)).toThrow()
  })
})

describe('fetch handler', () => {
  function env(success = true): Env {
    return { PHPSCAN_LIMITER: { limit: vi.fn(async () => ({ success })) } }
  }

  async function call(path: string, environment = env()) {
    const request = new Request(`https://nymbx.dev${path}`, {
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    })
    const handler = worker.fetch as unknown as (r: Request, e: Env) => Promise<Response>
    const response = await handler(request, environment)
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  it('rejects invalid and private targets before spending rate limit', async () => {
    const environment = env()
    expect(await call('/api/phpscan?url=example.com:22', environment)).toEqual({
      status: 400,
      body: { error: 'Only standard web ports (80 and 443) can be checked' },
    })
    expect((await call('/api/phpscan?url=192.168.1.1', environment)).status).toBe(400)
    expect(environment.PHPSCAN_LIMITER.limit).not.toHaveBeenCalled()
  })

  it('returns 429 when the client is over its limit', async () => {
    const environment = env(false)
    expect((await call('/api/phpscan?url=example.com', environment)).status).toBe(429)
    expect(environment.PHPSCAN_LIMITER.limit).toHaveBeenCalledWith({ key: '203.0.113.9' })
  })

  it('answers unknown API paths with 404', async () => {
    expect((await call('/api/other')).status).toBe(404)
  })
})
