/**
 * PDF date strings (`D:YYYYMMDDHHmmSSOHH'mm'`, PDF 32000-1 §7.9.4).
 *
 * Deliberately free of `pdf-lib` so the page chunk can parse and format dates
 * without pulling the parser in.
 */

/** Lenient form: everything after the year is optional, as the spec allows. */
const PDF_DATE = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}(?:'\d{2}'?)?)?$/

/** True when `raw` looks like a PDF date string at all. */
export function looksLikePdfDate(raw: string): boolean {
  return PDF_DATE.test(raw.trim())
}

/**
 * Parse a PDF date string. Missing month/day default to 01, missing time parts
 * to 00. A missing time zone means "local" per the spec; we read it as UTC and
 * let the UI say the value carries no time zone. Returns `null` when the string
 * is not a PDF date at all.
 */
export function parsePdfDate(raw: string): Date | null {
  const match = PDF_DATE.exec(raw.trim())
  if (!match) return null
  const [, year, month, day, hour, minute, second, zone] = match
  const ms = Date.UTC(
    Number(year),
    month ? Number(month) - 1 : 0,
    day ? Number(day) : 1,
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0,
    second ? Number(second) : 0,
  )
  if (Number.isNaN(ms)) return null
  let offsetMinutes = 0
  if (zone && zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1
    const digits = zone.slice(1).replace(/'/g, '')
    const zoneHours = Number(digits.slice(0, 2))
    const zoneMinutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0
    offsetMinutes = sign * (zoneHours * 60 + zoneMinutes)
  }
  const date = new Date(ms - offsetMinutes * 60_000)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Whether a parseable PDF date carries an explicit time zone. */
export function pdfDateHasZone(raw: string): boolean {
  const match = PDF_DATE.exec(raw.trim())
  return Boolean(match?.[7])
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** `D:YYYYMMDDHHmmSSZ` — always written in UTC. */
export function formatPdfDate(date: Date): string {
  return (
    `D:${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/** Value for `<input type="datetime-local" step="1">`, in the viewer's zone. */
export function toDatetimeLocal(date: Date): string {
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** Read a `datetime-local` value back as a Date in the viewer's zone. */
export function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
