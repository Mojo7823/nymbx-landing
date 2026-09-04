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
    const detail = total > 0 ? ` · ${formatBytes(current)} of ${formatBytes(total)}` : ''
    const isModel = key.includes('/models/')
    const what = isModel ? 'AI model' : 'AI runtime'
    const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : null
    return {
      label: `Downloading ${what}${detail}`,
      // A removal run fetches the model first and the one compatible WASM runtime
      // second. Give each a fixed slice so the overall bar never jumps backwards
      // when IMG.LY starts reporting a new resource from zero.
      percent: ratio === null ? null : isModel ? ratio * 82 : 82 + ratio * 12,
    }
  }
  if (key.startsWith('compute:')) {
    return {
      label: current >= total && total > 0 ? 'Finishing image…' : 'Analyzing image…',
      percent: current >= total && total > 0 ? 99 : 95,
    }
  }
  return { label: 'Preparing…', percent: 0 }
}
