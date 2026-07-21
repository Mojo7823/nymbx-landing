import { DateTime } from 'luxon'

export type EpochUnit = 'auto' | 'seconds' | 'milliseconds' | 'microseconds'

export type InputKind =
  'epoch-seconds' | 'epoch-milliseconds' | 'epoch-microseconds' | 'date-string'

export interface ParsedInput {
  /** Milliseconds since the Unix epoch (fractional below 1 ms). */
  millis: number
  kind: InputKind
}

export interface ConvertedTimestamp {
  epochSeconds: number
  epochMillis: number
  epochMicros: number
  /** ISO 8601 in the selected zone, with offset. */
  iso: string
  isoUtc: string
  /** Long human-readable form in the selected zone. */
  human: string
  relative: string
  zoneName: string
}

export interface BatchRow {
  input: string
  result?: ConvertedTimestamp
  error?: string
}

/** |n| below this is read as seconds (covers years up to ~5138). */
const SECONDS_MAX = 1e11
/** |n| below this (and above SECONDS_MAX) is read as milliseconds. */
const MILLIS_MAX = 1e14

export function parseTimestampInput(input: string, unit: EpochUnit, zone: string): ParsedInput {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('Input is empty.')

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const value = Number(trimmed)
    const detected: EpochUnit =
      unit !== 'auto'
        ? unit
        : Math.abs(value) < SECONDS_MAX
          ? 'seconds'
          : Math.abs(value) < MILLIS_MAX
            ? 'milliseconds'
            : 'microseconds'
    const millis =
      detected === 'seconds' ? value * 1000 : detected === 'milliseconds' ? value : value / 1000
    if (!Number.isFinite(millis) || Math.abs(millis) > 8.64e15) {
      throw new Error('Epoch value is out of the representable date range.')
    }
    return { millis, kind: `epoch-${detected}` as InputKind }
  }

  const formats = [
    DateTime.fromISO(trimmed, { zone }),
    DateTime.fromRFC2822(trimmed, { zone }),
    DateTime.fromSQL(trimmed, { zone }),
  ]
  const parsed = formats.find((dt) => dt.isValid)
  if (!parsed) {
    throw new Error('Could not parse this input as an epoch, ISO 8601, RFC 2822 or SQL date.')
  }
  return { millis: parsed.toMillis(), kind: 'date-string' }
}

export function convertTimestamp(millis: number, zone: string, now?: number): ConvertedTimestamp {
  const dt = DateTime.fromMillis(millis, { zone })
  if (!dt.isValid) {
    throw new Error(dt.invalidExplanation ?? 'Invalid timestamp or timezone.')
  }
  const base = DateTime.fromMillis(now ?? Date.now(), { zone })
  return {
    epochSeconds: millis / 1000,
    epochMillis: millis,
    epochMicros: Math.round(millis * 1000),
    iso: dt.toISO()!,
    isoUtc: dt.toUTC().toISO()!,
    human: dt.toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS),
    relative: dt.toRelative({ base }) ?? '',
    zoneName: dt.zoneName ?? zone,
  }
}

export function listZones(): string[] {
  const zones = Intl.supportedValuesOf('timeZone')
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

export function localZone(): string {
  return DateTime.local().zoneName
}

export function convertBatch(text: string, unit: EpochUnit, zone: string): BatchRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((input) => {
      try {
        const { millis } = parseTimestampInput(input, unit, zone)
        return { input, result: convertTimestamp(millis, zone) }
      } catch (cause) {
        return { input, error: cause instanceof Error ? cause.message : 'Conversion failed.' }
      }
    })
}
