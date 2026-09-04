import { ZxcvbnFactory, type ZxcvbnResult } from '@zxcvbn-ts/core'
import { adjacencyGraphs, dictionary as commonDictionary } from '@zxcvbn-ts/language-common'
import { dictionary as englishDictionary, translations } from '@zxcvbn-ts/language-en'

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

let factory: ZxcvbnFactory | null = null

function getFactory(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({
    translations,
    graphs: adjacencyGraphs,
    dictionary: { ...commonDictionary, ...englishDictionary },
  })
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
