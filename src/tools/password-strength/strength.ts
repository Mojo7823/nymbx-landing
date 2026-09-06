import type { ZxcvbnFactory, ZxcvbnResult } from '@zxcvbn-ts/core'

/** Long pastes would jank the synchronous scorer; analyze a prefix and say so. */
export const MAX_ANALYZED_LENGTH = 512

export const SCORE_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const

export interface CrackTimeRow {
  scenario: string
  display: string
  seconds: number
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4
  scoreLabel: string
  guesses: number
  guessesDisplay: string
  crackTimes: CrackTimeRow[]
  warning: string | null
  suggestions: string[]
  /** Human-readable, deduplicated breakdown of the detected match patterns. */
  patterns: string[]
  truncated: boolean
}

const PATTERN_LABELS: Record<string, string> = {
  dictionary: 'Common word or name',
  spatial: 'Keyboard pattern',
  repeat: 'Repeated characters',
  sequence: 'Sequence (abc, 321)',
  regex: 'Simple pattern',
  date: 'Date',
  bruteforce: 'Random characters',
}

/**
 * The zxcvbn dictionaries are ~1.6 MB of the page's weight, which is far too
 * much to ship with the route. They live behind a single dynamic import that
 * runs on the first keystroke (or on idle after mount), so the page itself
 * stays small and the packages become their own chunks.
 */
let factory: ZxcvbnFactory | null = null
let loading: Promise<ZxcvbnFactory> | null = null

/** True once the dictionaries are loaded and `checkStrength` can be called. */
export function isStrengthReady(): boolean {
  return factory !== null
}

/** Load the dictionaries. Idempotent; concurrent callers share one import. */
export function initStrength(): Promise<ZxcvbnFactory> {
  if (factory) return Promise.resolve(factory)
  loading ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(([core, common, english]) => {
    factory = new core.ZxcvbnFactory({
      translations: english.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...english.dictionary },
    })
    return factory
  })
  return loading
}

function getFactory(): ZxcvbnFactory {
  if (!factory) {
    throw new Error('checkStrength() called before initStrength() resolved')
  }
  return factory
}

export function formatGuesses(guesses: number): string {
  if (!Number.isFinite(guesses)) return 'more than countable'
  if (guesses < 1_000_000) return Math.round(guesses).toLocaleString('en-US')
  return guesses.toExponential(1).replace('e+', ' × 10^')
}

function rowsOf(result: ZxcvbnResult): CrackTimeRow[] {
  const t = result.crackTimes
  return [
    { scenario: 'Online attack, throttled (100 guesses/hour)', ...t.onlineThrottlingXPerHour },
    {
      scenario: 'Online attack, unthrottled (10 guesses/second)',
      ...t.onlineNoThrottlingXPerSecond,
    },
    {
      scenario: 'Offline attack, slow hash (10k guesses/second)',
      ...t.offlineSlowHashingXPerSecond,
    },
    {
      scenario: 'Offline attack, fast hash (10B guesses/second)',
      ...t.offlineFastHashingXPerSecond,
    },
  ]
}

/**
 * Score a password entirely locally. Returns `null` for empty input.
 * Pure and side-effect-free: reads nothing, writes nothing, sends nothing.
 * Requires `initStrength()` to have resolved first.
 */
export function checkStrength(password: string): StrengthResult | null {
  if (password === '') return null
  const truncated = password.length > MAX_ANALYZED_LENGTH
  const analyzed = truncated ? password.slice(0, MAX_ANALYZED_LENGTH) : password
  const result = getFactory().check(analyzed)
  return {
    score: result.score,
    scoreLabel: SCORE_LABELS[result.score] ?? 'Unknown',
    guesses: result.guesses,
    guessesDisplay: formatGuesses(result.guesses),
    crackTimes: rowsOf(result),
    warning: result.feedback.warning || null,
    suggestions: [...(result.feedback.suggestions || [])],
    patterns: [...new Set(result.sequence.map((m) => PATTERN_LABELS[m.pattern] ?? m.pattern))],
    truncated,
  }
}
