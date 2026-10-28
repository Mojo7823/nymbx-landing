// PHP2Shell (CVE-2026-109618, CVE-2026-109619) exposure check, ported from
// github.com/Mojo7823/phpscan (check/check.go). Pure and runtime-neutral: the
// browser uses it on pasted responses, the Cloudflare Worker (worker/index.ts)
// on responses it fetched. It reads what a site already sends to every visitor
// and never builds an attack payload.

export const REPO_URL = 'https://github.com/Mojo7823/phpscan'

/** First fixed release per supported branch (PHP security release, 2026-10-21). */
const FIXED: Record<string, number> = { '8.2': 35, '8.3': 36, '8.4': 27, '8.5': 12 }

export type ScanStatus =
  'vulnerable' | 'likely_vulnerable' | 'unknown' | 'patched' | 'no_php_detected' | 'unreachable'

export interface ScanResult {
  /** The address that was checked, when known. */
  url?: string
  status: ScanStatus
  phpVersion?: string
  /** Affected appliance recognised from its login page. */
  product?: string
  /** Vendor advisory page for `product`. */
  advisory?: string
  evidence: string[]
  advice: string
  error?: string
}

export const ADVICE: Record<ScanStatus, string> = {
  vulnerable:
    'Upgrade PHP to 8.2.35, 8.3.36, 8.4.27, 8.5.12 or later. PHP 8.1 and older get no fixes, so move to a supported version. ' +
    'Until then, keep this service away from untrusted networks and limit request size, input fields and nesting depth at the web server or reverse proxy.',
  likely_vulnerable:
    "This PHP build comes from a Linux distribution, which may have backported the fix without changing the version number. Check your distribution's security tracker for CVE-2026-109618 and CVE-2026-109619 and install pending PHP updates.",
  unknown:
    'PHP is in use but its version is hidden. Run php -v on the server, or ask the device vendor whether its firmware includes the PHP2Shell fix.',
  patched: 'This PHP version includes the PHP2Shell fix. Keep it updated.',
  no_php_detected:
    "No sign of PHP in this response. That does not prove PHP isn't used elsewhere on this host.",
  unreachable: 'The page could not be loaded.',
}

/**
 * Appliances that vendors list as affected. They hide their PHP version, so
 * their login pages are matched instead. Best effort: extend as vendors publish.
 */
const PRODUCTS = [
  {
    marker: '/php/login.php',
    name: 'Palo Alto Networks PAN-OS management interface',
    advisory: 'https://security.paloaltonetworks.com',
  },
  { marker: 'fortisoar', name: 'Fortinet FortiSOAR', advisory: 'https://www.fortiguard.com/psirt' },
  { marker: 'fortiddos', name: 'Fortinet FortiDDoS', advisory: 'https://www.fortiguard.com/psirt' },
  {
    marker: 'cisco expressway',
    name: 'Cisco Expressway',
    advisory: 'https://sec.cloudapps.cisco.com/security/center/publicationListing.x',
  },
  {
    marker: 'duo access gateway',
    name: 'Cisco Duo Access Gateway',
    advisory: 'https://sec.cloudapps.cisco.com/security/center/publicationListing.x',
  },
]

const PHP_VERSION = /PHP\/(\d+)\.(\d+)\.(\d+)([-+~][\w.+~]*)?/i

export function classify(major: number, minor: number, patch: number, distro: string): ScanStatus {
  const fix = FIXED[`${major}.${minor}`]
  if (fix !== undefined && patch >= fix) return 'patched'
  // A branch newer than this advisory.
  if (fix === undefined && (major > 8 || (major === 8 && minor > 5))) return 'unknown'
  if (distro !== '') return 'likely_vulnerable'
  return 'vulnerable'
}

/** What one HTTP response reveals; header names are matched case-insensitively. */
export interface ResponseSnapshot {
  /** First value of each header, keyed by lowercase name. */
  headers: Map<string, string>
  setCookies: string[]
  /** Path of the final page, e.g. `/index.php`. Empty when unknown. */
  path: string
  body: string
}

export function analyze({ headers, setCookies, path, body }: ResponseSnapshot): ScanResult {
  const result: ScanResult = { status: 'no_php_detected', evidence: [], advice: '' }
  let php = false
  let versioned = false
  for (const name of ['X-Powered-By', 'Server']) {
    const value = headers.get(name.toLowerCase()) ?? ''
    if (!value.toLowerCase().includes('php')) continue
    php = true
    result.evidence.push(`${name}: ${value}`)
    const match = PHP_VERSION.exec(value)
    if (match && !versioned) {
      versioned = true
      result.phpVersion = match[0].slice('PHP/'.length)
      result.status = classify(Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? '')
    }
  }
  if (setCookies.some((cookie) => cookie.startsWith('PHPSESSID='))) {
    php = true
    result.evidence.push('PHP session cookie (PHPSESSID)')
  }
  const lowerPath = path.toLowerCase()
  if (lowerPath.endsWith('.php')) {
    php = true
    result.evidence.push(`page served from ${path}`)
  }
  const page = body.toLowerCase()
  if (page.includes('.php')) {
    php = true
    result.evidence.push('page links to .php files')
  }
  const product = PRODUCTS.find((p) => lowerPath.includes(p.marker) || page.includes(p.marker))
  if (product) {
    php = true
    result.product = product.name
    result.advisory = product.advisory
    result.evidence.push(`login page matches ${product.name}`)
  }

  if (!versioned) result.status = php ? 'unknown' : 'no_php_detected'
  result.advice = ADVICE[result.status]
  if (product && result.status !== 'patched') {
    result.advice += ` This looks like ${product.name}: install the fixed firmware from the vendor advisory and allow management access only from trusted internal IPs.`
  }
  return result
}

/**
 * Accepts a website address as people type it, adding `https://` when the
 * scheme is missing. Only http(s) on the standard web ports is allowed.
 */
export function parseTarget(raw: string): URL {
  let value = raw.trim()
  if (!value.includes('://')) value = `https://${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a website address, for example www.example.com')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') {
    throw new Error('Enter a website address, for example www.example.com')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('Remove the user name and password from the address')
  }
  // URL drops the scheme's default port, so only an explicit 80 on https or 443 on http remains.
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new Error('Only standard web ports (80 and 443) can be checked')
  }
  return url
}

const STATUS_LINE = /^HTTP\/\d(?:\.\d)?\s+\d{3}/i
const HEADER_LINE = /^([!#$%&'*+.^`|~\w-]+):[ \t]*(.*)$/
// HTTP/2 pseudo-headers such as `:status: 200`, as copied from devtools.
const PSEUDO_HEADER = /^:[a-z]+:/

/**
 * Parses pasted response text: `curl -i` / `curl -iL` output (the last
 * response wins, as with followed redirects), raw response headers copied from
 * browser devtools, or page source alone.
 */
export function parseResponseText(text: string, path = ''): ResponseSnapshot {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  // `curl -v` prefixes response lines with `< ` (a bare `<` ends the headers).
  const clean = lines.map((line) => line.replace(/^<(?: |$)/, ''))

  let start = clean.findIndex((line) => line.trim() !== '')
  if (start === -1) start = clean.length
  for (let i = start; i < clean.length; i++) {
    if (STATUS_LINE.test(clean[i])) start = i
  }

  const headers = new Map<string, string>()
  const setCookies: string[] = []
  const first = clean[start] ?? ''
  if (!STATUS_LINE.test(first) && !HEADER_LINE.test(first) && !PSEUDO_HEADER.test(first)) {
    return { headers, setCookies, path, body: text }
  }

  let i = STATUS_LINE.test(first) ? start + 1 : start
  for (; i < clean.length && clean[i].trim() !== ''; i++) {
    if (PSEUDO_HEADER.test(clean[i])) continue
    const match = HEADER_LINE.exec(clean[i])
    if (!match) continue
    const name = match[1].toLowerCase()
    const value = match[2].trim()
    if (name === 'set-cookie') setCookies.push(value)
    if (!headers.has(name)) headers.set(name, value)
  }
  return { headers, setCookies, path, body: lines.slice(i + 1).join('\n') }
}
