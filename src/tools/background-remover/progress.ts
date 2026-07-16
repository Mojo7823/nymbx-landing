import { formatBytes } from '../../lib/format'

export interface ProgressInfo {
  /** Short human label for the current stage. */
  label: string
  /** 0–100, or null when the stage has no measurable progress. */
  percent: number | null
}

/**
 * Map @imgly/background-removal progress callbacks — `(key, current, total)`
 * with keys like `fetch:/models/medium` or `compute:inference` — to UI copy.
 */
export function describeProgress(key: string, current: number, total: number): ProgressInfo {
  if (key.startsWith('fetch:')) {
    const detail = total > 0 ? ` — ${formatBytes(current)} of ${formatBytes(total)}` : ''
    const what = key.includes('/models/') ? 'AI model' : 'runtime'
    return {
      label: `Downloading ${what}${detail}`,
      percent: total > 0 ? (current / total) * 100 : null,
    }
  }
  if (key.startsWith('compute:')) {
    return { label: 'Analyzing image…', percent: null }
  }
  return { label: 'Preparing…', percent: null }
}
