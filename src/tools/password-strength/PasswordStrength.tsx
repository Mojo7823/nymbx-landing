import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import {
  checkStrength,
  initStrength,
  isStrengthReady,
  SCORE_LABELS,
  type StrengthResult,
} from './strength'

const WEAK_SAMPLE = 'password123'
const STRONG_SAMPLE = 'grape-crystal orbit?7 violin'

const METER_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-400',
  'bg-lime-500',
  'bg-emerald-500',
]

function charsetSummary(password: string): string {
  const classes = [
    /[a-z]/.test(password) && 'lowercase',
    /[A-Z]/.test(password) && 'UPPERCASE',
    /\d/.test(password) && 'digits',
    /[^a-zA-Z\d]/.test(password) && 'symbols',
  ].filter(Boolean)
  return `${password.length} characters · ${classes.length > 0 ? classes.join(' + ') : 'empty'}`
}

export default function PasswordStrength() {
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [ready, setReady] = useState(isStrengthReady)
  const [loadError, setLoadError] = useState(false)
  const [analysis, setAnalysis] = useState<{
    result: StrengthResult | null
    summary: string
  } | null>(null)
  const typing = password !== ''
  const result = analysis?.result ?? null

  // Fetch the dictionaries only when there is something to score, never on idle.
  useEffect(() => {
    if (ready || !typing) return
    let cancelled = false
    initStrength().then(
      () => {
        if (!cancelled) setReady(true)
      },
      () => {
        if (!cancelled) setLoadError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [ready, typing])

  useEffect(() => {
    if (!ready || password === '') return
    const timer = window.setTimeout(() => {
      setAnalysis({ result: checkStrength(password), summary: charsetSummary(password) })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [password, ready])

  function changePassword(value: string) {
    if (value === password) return
    setPassword(value)
    setAnalysis(null)
    if (value === '') setLoadError(false)
  }

  function clear() {
    // No storage or network writes; discard the input and its analysis together.
    changePassword('')
  }

  const filled = result ? result.score + 1 : 0

  return (
    <ToolLayout>
      <div
        className="mb-6 flex items-start gap-2.5 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5 text-sm text-pine"
        role="note"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Your password never leaves this device.</strong> It is
          not sent over the network or saved to storage. Clear removes the input and its analysis.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-xs font-semibold text-muted">
          Password
        </label>
        <div className="flex gap-2">
          <input
            id="password"
            name="password"
            type={revealed ? 'text' : 'password'}
            value={password}
            onChange={(event) => changePassword(event.target.value)}
            placeholder="Type or paste a password to check it…"
            spellCheck={false}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 font-mono text-sm text-ink placeholder:font-sans placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} disabled={password === ''}>
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => changePassword(WEAK_SAMPLE)}>
            <Sparkles className="size-3.5" />
            Load weak sample
          </Button>
          <Button variant="ghost" size="sm" onClick={() => changePassword(STRONG_SAMPLE)}>
            <Sparkles className="size-3.5" />
            Load strong sample
          </Button>
        </div>
      </div>

      {result ? (
        <div className="mt-6 flex flex-col gap-5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Strength</span>
              <span role="status" className="text-sm font-bold text-ink">
                {result.scoreLabel} · {result.score}/4
              </span>
            </div>
            <div
              className="mt-2 flex gap-1.5"
              role="img"
              aria-label={`Password strength ${result.score} out of 4: ${result.scoreLabel}`}
            >
              {SCORE_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={cx(
                    'h-2.5 flex-1 rounded-full',
                    i < filled ? METER_COLORS[result.score] : 'bg-line',
                  )}
                />
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted tabular-nums">
              {analysis?.summary} · ≈{result.guessesDisplay} guesses needed
            </p>
          </div>

          {result.warning && (
            <p role="alert" className="text-sm text-amber-badge">
              {result.warning}
            </p>
          )}
          {result.suggestions.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
              {result.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <caption className="px-4 pt-3 pb-1 text-left text-xs font-semibold text-muted">
                Estimated time to crack
              </caption>
              <tbody>
                {result.crackTimes.map((row) => (
                  <tr key={row.scenario} className="border-t border-line">
                    <th
                      scope="row"
                      className="px-4 py-2 text-left align-top text-xs font-normal text-muted"
                    >
                      {row.scenario}
                    </th>
                    <td className="px-4 py-2 text-right font-mono text-xs whitespace-nowrap text-ink tabular-nums">
                      {row.display}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.patterns.length > 0 && (
            <p className="text-xs text-faint">
              Detected in your password: {result.patterns.join(' · ')}
            </p>
          )}
          {result.truncated && (
            <p className="text-xs text-faint">
              Very long input: only the first 512 characters were analyzed.
            </p>
          )}
        </div>
      ) : typing && loadError ? (
        <div className="mt-6">
          <p role="alert" className="mb-2 text-sm text-amber-badge">
            The password dictionaries could not be loaded. Check your connection, then reload the
            tool. Reload clears this input.
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Reload tool
          </Button>
        </div>
      ) : typing && !ready ? (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Loading dictionaries…
        </p>
      ) : (
        <p className="mt-6 text-sm text-faint">
          The strength meter, crack-time estimates, and advice appear here as you type.
        </p>
      )}
    </ToolLayout>
  )
}
