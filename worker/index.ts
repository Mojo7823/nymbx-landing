// The site's only server code: GET /api/phpscan?url=<site> for the PHP2Shell
// checker (/tools/phptest). Every other path is a static asset served without
// running this Worker (assets.run_worker_first in wrangler.jsonc).
//
// One ordinary GET per check, like a browser visit: it reads only what the site
// sends to every visitor, never sends an attack payload, and stores nothing.
// Abuse limits: ports 80/443 only (no port scanning), same-host redirects only,
// no localhost/private/IP-literal targets, and a per-client rate limit.
// Workers subrequests cannot reach private networks; global_fetch_strictly_public
// keeps requests for nymbx.dev itself on the public front door.

import { ADVICE, REPO_URL, analyze, parseTarget, type ScanResult } from '../src/tools/phptest/scan'

export interface Env {
  PHPSCAN_LIMITER: RateLimit
}

const MAX_REQUESTS = 5 // the first request plus up to four same-host redirects
const BODY_LIMIT = 64 * 1024
const TIMEOUT_MS = 10_000
const USER_AGENT = `phpscan/0.1 (PHP2Shell exposure check; +${REPO_URL})`

type Fetch = (input: URL, init: RequestInit) => Promise<Response>

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url)
    if (pathname !== '/api/phpscan') return error(404, 'Not found')
    if (request.method !== 'GET') return error(405, 'Use GET')

    let target: URL
    try {
      target = parseTarget(searchParams.get('url') ?? '')
      assertPublicHost(target.hostname)
    } catch (cause) {
      return error(400, (cause as Error).message)
    }

    const client = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const { success } = await env.PHPSCAN_LIMITER.limit({ key: client })
    if (!success) return error(429, 'Too many checks right now. Please try again in a minute.')

    return json(200, await scan(target))
  },
} satisfies ExportedHandler<Env>

/** Sends one GET to `target` (following same-host redirects) and reports PHP2Shell exposure. */
export async function scan(target: URL, fetcher: Fetch = fetch): Promise<ScanResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let current = target
  try {
    for (let requests = 1; ; requests++) {
      const response = await fetcher(current, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
      })
      const next = sameHostRedirect(response, current, target)
      if (next && requests < MAX_REQUESTS) {
        await response.body?.cancel()
        current = next
        continue
      }
      const headers = new Map<string, string>()
      for (const name of ['server', 'x-powered-by']) {
        const value = response.headers.get(name)
        if (value !== null) headers.set(name, value)
      }
      const result = analyze({
        headers,
        setCookies: response.headers.getSetCookie(),
        path: current.pathname,
        body: await readText(response, BODY_LIMIT),
      })
      return { url: target.href, ...result }
    }
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : String(cause)
    const message =
      cause instanceof Error && cause.name === 'TimeoutError'
        ? `No response within ${TIMEOUT_MS / 1000} seconds`
        : // The runtime hides connection and TLS failures behind an opaque internal error.
          /^internal error/i.test(raw)
          ? 'Could not connect. The site may be down, block this scanner, or use an invalid TLS certificate.'
          : raw
    return {
      url: target.href,
      status: 'unreachable',
      evidence: [],
      advice: ADVICE.unreachable,
      error: message,
    }
  }
}

/** A redirect the check may follow: same host, http(s), standard web port. */
function sameHostRedirect(response: Response, current: URL, target: URL): URL | null {
  const location = response.headers.get('Location')
  if (response.status < 300 || response.status > 399 || location === null) return null
  let next: URL
  try {
    next = parseTarget(new URL(location, current).href)
  } catch {
    return null
  }
  return next.hostname === target.hostname ? next : null
}

async function readText(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value.subarray(0, limit - size))
    size += value.byteLength
  }
  await reader.cancel()
  const decoder = new TextDecoder()
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
}

/**
 * Rejects names and address literals that point at private, loopback,
 * link-local, shared or documentation space. URL has already normalized IPv4
 * shorthands (`2130706433`, `0x7f.1`) to dotted quads.
 */
export function assertPublicHost(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const local = host.startsWith('[')
    ? !isPublicIPv6(host.slice(1, -1))
    : !host.includes('.') ||
      /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(host) ||
      (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !isPublicIPv4(host))
  if (local) throw new Error('Only public websites can be checked')
}

const PRIVATE_IPV4: [number, number][] = [
  [0x00000000, 8], // "this" network
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, cloud metadata
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // documentation
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // documentation
  [0xcb007100, 24], // documentation
  [0xe0000000, 3], // multicast, reserved, broadcast
]

function isPublicIPv4(host: string): boolean {
  const value = host.split('.').reduce((n, octet) => n * 256 + Number(octet), 0)
  return !PRIVATE_IPV4.some(([base, bits]) => value >>> (32 - bits) === base >>> (32 - bits))
}

/** Global unicast 2000::/3 only; excludes the documentation prefix 2001:db8::/32. */
function isPublicIPv6(host: string): boolean {
  if (host.startsWith('2001:db8:')) return false
  const first = parseInt(host.split(':')[0], 16)
  return first >= 0x2000 && first <= 0x3fff
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function error(status: number, message: string): Response {
  return json(status, { error: message })
}
