/** Pure helpers for the QR generator tab: payload building and validation. */

export type QrFormat = 'text' | 'url' | 'wifi'
export type WifiEncryption = 'WPA' | 'WEP' | 'nopass'
export type EcLevel = 'L' | 'M' | 'Q' | 'H'

export const EC_LABELS: Record<EcLevel, string> = {
  L: 'L — 7% damage tolerance',
  M: 'M — 15% damage tolerance',
  Q: 'Q — 25% damage tolerance',
  H: 'H — 30% damage tolerance',
}

/** Maximum bytes the `qrcode` encoder accepts (byte mode, lowest EC level). */
export const MAX_QR_BYTES = 2953

export interface WifiCredentials {
  ssid: string
  password: string
  encryption: WifiEncryption
  hidden: boolean
}

/** Escape the four characters that are special inside a Wi-Fi QR payload. */
export function escapeWifiField(value: string): string {
  return value.replace(/([\\;,":])/g, '\\$1')
}

/**
 * Build a `WIFI:…;;` payload scanners understand. Matches the de-facto
 * format Android/iOS expect (encryption token, ssid, password, hidden flag).
 */
export function buildWifiPayload({ ssid, password, encryption, hidden }: WifiCredentials): string {
  const parts = [`WIFI:T:${encryption}`, `S:${escapeWifiField(ssid)}`]
  if (encryption !== 'nopass') parts.push(`P:${escapeWifiField(password)}`)
  if (hidden) parts.push('H:true')
  return `${parts.join(';')};;`
}

export interface ParsedWifi {
  ssid: string
  encryption: string
  hasPassword: boolean
  hidden: boolean
}

/** Parse a scanned `WIFI:…;;` payload back into displayable fields. */
export function parseWifiPayload(payload: string): ParsedWifi | null {
  const match = /^WIFI:(.*);;?$/.exec(payload.trim())
  if (!match) return null
  const fields = new Map<string, string>()
  for (const part of match[1]!.split(/(?<!\\);/)) {
    const colon = part.indexOf(':')
    if (colon > 0) fields.set(part.slice(0, colon), part.slice(colon + 1).replace(/\\(.)/g, '$1'))
  }
  const ssid = fields.get('S')
  if (ssid === undefined) return null
  return {
    ssid,
    encryption: fields.get('T') ?? 'nopass',
    hasPassword: fields.has('P'),
    hidden: fields.get('H') === 'true',
  }
}

export interface PayloadNotice {
  level: 'error' | 'warning'
  message: string
}

/** Friendly validation notice, or null when the payload is encodable. */
export function validatePayload(text: string, format: QrFormat): PayloadNotice | null {
  if (text === '') return { level: 'error', message: 'Enter something to encode first.' }
  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_QR_BYTES) {
    return {
      level: 'error',
      message: `Too long for a QR code (${bytes.toLocaleString('en-US')} of max ${MAX_QR_BYTES.toLocaleString('en-US')} bytes). Shorten the text or split it across codes.`,
    }
  }
  if (
    format === 'url' &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(text) &&
    !/^[\w-]+(\.[\w-]+)+/.test(text)
  ) {
    return {
      level: 'warning',
      message: 'This does not look like a URL. It will still encode as plain text.',
    }
  }
  return null
}
