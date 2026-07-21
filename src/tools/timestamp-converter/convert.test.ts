import { describe, expect, it } from 'vitest'
import {
  convertBatch,
  convertTimestamp,
  listZones,
  localZone,
  parseTimestampInput,
} from './convert'

const NY = 'America/New_York'

describe('parseTimestampInput epoch auto-detection', () => {
  it('detects 10-digit numbers as seconds', () => {
    const parsed = parseTimestampInput('1700000000', 'auto', 'UTC')
    expect(parsed.kind).toBe('epoch-seconds')
    expect(parsed.millis).toBe(1_700_000_000_000)
  })

  it('detects 13-digit numbers as milliseconds', () => {
    const parsed = parseTimestampInput('1700000000000', 'auto', 'UTC')
    expect(parsed.kind).toBe('epoch-milliseconds')
    expect(parsed.millis).toBe(1_700_000_000_000)
  })

  it('detects 16-digit numbers as microseconds', () => {
    const parsed = parseTimestampInput('1700000000000000', 'auto', 'UTC')
    expect(parsed.kind).toBe('epoch-microseconds')
    expect(parsed.millis).toBe(1_700_000_000_000)
  })

  it('lets an explicit unit override the auto-detection', () => {
    expect(parseTimestampInput('1700000000000', 'seconds', 'UTC').millis).toBe(
      1_700_000_000_000_000,
    )
    expect(parseTimestampInput('1700000000', 'milliseconds', 'UTC').millis).toBe(1_700_000_000)
    expect(parseTimestampInput('1700000000', 'microseconds', 'UTC').millis).toBe(1_700_000)
  })

  it('handles negative (pre-1970) epochs', () => {
    expect(parseTimestampInput('-86400', 'auto', 'UTC').millis).toBe(-86_400_000)
  })
})

describe('parseTimestampInput date strings', () => {
  it('parses ISO 8601 with an explicit offset', () => {
    const parsed = parseTimestampInput('2024-02-29T12:00:00Z', 'auto', NY)
    expect(parsed.kind).toBe('date-string')
    expect(parsed.millis).toBe(Date.UTC(2024, 1, 29, 12))
  })

  it('interprets ISO without an offset in the selected zone', () => {
    // 12:00 wall clock in New York (EST, UTC-5) = 17:00 UTC
    const parsed = parseTimestampInput('2024-01-15T12:00:00', 'auto', NY)
    expect(parsed.millis).toBe(Date.UTC(2024, 0, 15, 17))
  })

  it('accepts the leap day 2024-02-29 but rejects 2023-02-29', () => {
    expect(parseTimestampInput('2024-02-29', 'auto', 'UTC').millis).toBe(Date.UTC(2024, 1, 29))
    expect(() => parseTimestampInput('2023-02-29', 'auto', 'UTC')).toThrow()
  })

  it('rejects impossible end-of-month dates', () => {
    expect(() => parseTimestampInput('2024-04-31', 'auto', 'UTC')).toThrow()
  })

  it('rejects unparseable input with a clear error', () => {
    expect(() => parseTimestampInput('not a date', 'auto', 'UTC')).toThrow(/could not/i)
    expect(() => parseTimestampInput('', 'auto', 'UTC')).toThrow(/empty/i)
  })
})

describe('convertTimestamp', () => {
  it('renders the instant right after the 2024 US spring-forward with the DST offset', () => {
    // 2024-03-10T07:00:00Z = 03:00 EDT (UTC-4), one hour after 01:59 EST
    const result = convertTimestamp(1_710_054_000_000, NY)
    expect(result.iso).toBe('2024-03-10T03:00:00.000-04:00')
  })

  it('renders the instant right before the same transition with the standard offset', () => {
    // 2024-03-10T06:00:00Z = 01:00 EST (UTC-5)
    const result = convertTimestamp(1_710_050_400_000, NY)
    expect(result.iso).toBe('2024-03-10T01:00:00.000-05:00')
  })

  it('maps a nonexistent spring-forward wall time forward when parsing', () => {
    // 02:30 on 2024-03-10 does not exist in New York; luxon lands on 03:30 EDT
    const parsed = parseTimestampInput('2024-03-10T02:30:00', 'auto', NY)
    expect(convertTimestamp(parsed.millis, NY).iso).toBe('2024-03-10T03:30:00.000-04:00')
  })

  it('reports every epoch unit and UTC ISO for one instant', () => {
    const result = convertTimestamp(1_700_000_000_000, 'UTC')
    expect(result.epochSeconds).toBe(1_700_000_000)
    expect(result.epochMillis).toBe(1_700_000_000_000)
    expect(result.epochMicros).toBe(1_700_000_000_000_000)
    expect(result.isoUtc).toBe('2023-11-14T22:13:20.000Z')
    expect(result.human).toContain('2023')
  })

  it('shows relative time against a supplied reference', () => {
    const now = 1_700_000_000_000
    expect(convertTimestamp(now - 2 * 3600_000, 'UTC', now).relative).toBe('2 hours ago')
    expect(convertTimestamp(now + 90_000, 'UTC', now).relative).toMatch(/in 1 minute/)
  })
})

describe('zones', () => {
  it('lists IANA zones including UTC and the local zone', () => {
    const zones = listZones()
    expect(zones).toContain('UTC')
    expect(zones).toContain('America/New_York')
    expect(zones).toContain(localZone())
  })

  it('localZone returns a valid zone usable for conversion', () => {
    expect(() => convertTimestamp(0, localZone())).not.toThrow()
  })
})

describe('convertBatch', () => {
  it('converts each non-empty line and reports per-line errors', () => {
    const rows = convertBatch('1700000000\n\n2024-02-29T12:00:00Z\nnonsense', 'auto', 'UTC')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.result?.epochMillis).toBe(1_700_000_000_000)
    expect(rows[1]!.result?.isoUtc).toBe('2024-02-29T12:00:00.000Z')
    expect(rows[2]!.error).toBeTruthy()
  })
})
