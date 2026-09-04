import { describe, expect, it } from 'vitest'
import { buildWifiPayload, MAX_QR_BYTES, parseWifiPayload, validatePayload } from './qr'
import { downscaleSize, MAX_DECODE_DIMENSION } from './decode'

describe('QR payload helpers', () => {
  it('builds a WPA Wi-Fi payload scanners accept', () => {
    expect(
      buildWifiPayload({ ssid: 'HomeWiFi', password: 's3cret!', encryption: 'WPA', hidden: false }),
    ).toBe('WIFI:T:WPA;S:HomeWiFi;P:s3cret!;;')
  })

  it('marks hidden networks and omits passwords for open ones', () => {
    expect(
      buildWifiPayload({ ssid: 'Cafe', password: '', encryption: 'nopass', hidden: true }),
    ).toBe('WIFI:T:nopass;S:Cafe;H:true;;')
  })

  it('escapes separator characters inside SSID and password', () => {
    expect(
      buildWifiPayload({ ssid: 'a;b,c', password: 'p"a\\ss', encryption: 'WPA', hidden: false }),
    ).toBe('WIFI:T:WPA;S:a\\;b\\,c;P:p\\"a\\\\ss;;')
  })

  it('parses a scanned Wi-Fi payload back into fields', () => {
    expect(parseWifiPayload('WIFI:T:WPA;S:HomeWiFi;P:s3cret!;;')).toEqual({
      ssid: 'HomeWiFi',
      encryption: 'WPA',
      hasPassword: true,
      hidden: false,
    })
    expect(parseWifiPayload('WIFI:T:nopass;S:Cafe;H:true;;')).toEqual({
      ssid: 'Cafe',
      encryption: 'nopass',
      hasPassword: false,
      hidden: true,
    })
  })

  it('round-trips escaped values through build and parse', () => {
    const payload = buildWifiPayload({
      ssid: 'we;ird,ssid',
      password: 'quo"ted',
      encryption: 'WEP',
      hidden: true,
    })
    expect(parseWifiPayload(payload)).toEqual({
      ssid: 'we;ird,ssid',
      encryption: 'WEP',
      hasPassword: true,
      hidden: true,
    })
  })

  it('rejects non-Wi-Fi payloads when parsing', () => {
    expect(parseWifiPayload('https://example.com')).toBeNull()
    expect(parseWifiPayload('WIFI:T:WPA;P:x;;')).toBeNull() // missing SSID
  })

  it('blocks empty and oversized payloads, warns on non-URL text in URL mode', () => {
    expect(validatePayload('', 'text')).toMatchObject({ level: 'error' })
    expect(validatePayload('x'.repeat(MAX_QR_BYTES + 1), 'text')).toMatchObject({ level: 'error' })
    expect(validatePayload('x'.repeat(MAX_QR_BYTES), 'text')).toBeNull()
    expect(validatePayload('just some words', 'url')).toMatchObject({ level: 'warning' })
    expect(validatePayload('https://example.com/a?b=c', 'url')).toBeNull()
    expect(validatePayload('example.com/path', 'url')).toBeNull()
  })
})

describe('decode image sizing', () => {
  it('leaves small images alone and downscales huge ones proportionally', () => {
    expect(downscaleSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(downscaleSize(MAX_DECODE_DIMENSION, 100)).toEqual({
      width: MAX_DECODE_DIMENSION,
      height: 100,
    })
    const big = downscaleSize(4000, 3000)
    expect(Math.max(big.width, big.height)).toBe(MAX_DECODE_DIMENSION)
    expect(big.width / big.height).toBeCloseTo(4 / 3, 5)
  })
})
