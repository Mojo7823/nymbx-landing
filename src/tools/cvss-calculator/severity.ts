/** Qualitative severity rating scale, identical in CVSS v3.1 (§5) and v4.0 (§3). */

export type Severity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical'

/** Map a 0.0–10.0 score to its severity band. */
export function severityOf(score: number): Severity {
  if (score <= 0) return 'None'
  if (score < 4) return 'Low'
  if (score < 7) return 'Medium'
  if (score < 9) return 'High'
  return 'Critical'
}

/** Tailwind classes for the severity band, using the shared semantic tokens. */
export const severityClasses: Record<Severity, string> = {
  None: 'bg-soft text-muted',
  Low: 'bg-mint text-pine-deep',
  Medium: 'bg-amber-soft text-amber-badge',
  High: 'bg-rose-soft text-rose',
  Critical: 'bg-rose text-page',
}

/** Stroke colour for the gauge arc, matching the band. */
export const severityStroke: Record<Severity, string> = {
  None: 'var(--color-line-strong)',
  Low: 'var(--color-pine)',
  Medium: 'var(--color-amber-badge)',
  High: 'var(--color-rose)',
  Critical: 'var(--color-rose)',
}
