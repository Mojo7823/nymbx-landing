import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, RotateCcw } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { toast } from '../../lib/toast'
import { MetricGroup } from './MetricGroup'
import { ScoreGauge } from './ScoreGauge'
import { parseHash, toHash, type CvssVersion } from './hash'
import { severityClasses, type Severity } from './severity'
import { CvssParseError, type MetricDefinition } from './vector'
import {
  defaultV31Selection,
  formatV31,
  hasEnvironmental,
  hasTemporal,
  parseV31,
  v31Metrics,
  type V31Selection,
} from './v31/metrics'
import { scoreV31 } from './v31/score'
import {
  defaultV4Selection,
  formatV4,
  hasGroupSet,
  parseV4,
  v4Metrics,
  type V4Selection,
} from './v4/metrics'
import { scoreV4 } from './v4/score'

const V30_NOTE = 'CVSS:3.0 vector accepted — it is scored with the v3.1 equations.'

const v31Groups: { id: string; title: string; hint: string; metrics: MetricDefinition[] }[] = [
  {
    id: 'base',
    title: 'Base metrics',
    hint: 'Intrinsic qualities of the vulnerability',
    metrics: v31Metrics.filter((m) => m.group === 'base'),
  },
  {
    id: 'temporal',
    title: 'Temporal metrics',
    hint: 'How the vulnerability changes over time',
    metrics: v31Metrics.filter((m) => m.group === 'temporal'),
  },
  {
    id: 'environmental',
    title: 'Environmental metrics',
    hint: 'Your environment and security requirements',
    metrics: v31Metrics.filter((m) => m.group === 'environmental'),
  },
]

const v4Groups: { id: string; title: string; hint: string; metrics: MetricDefinition[] }[] = [
  {
    id: 'base',
    title: 'Base metrics',
    hint: 'Intrinsic qualities of the vulnerability',
    metrics: v4Metrics.filter((m) => m.group === 'base'),
  },
  {
    id: 'threat',
    title: 'Threat metrics',
    hint: 'Current exploit maturity',
    metrics: v4Metrics.filter((m) => m.group === 'threat'),
  },
  {
    id: 'environmental',
    title: 'Environmental metrics',
    hint: 'Your environment and security requirements',
    metrics: v4Metrics.filter((m) => m.group === 'environmental'),
  },
  {
    id: 'supplemental',
    title: 'Supplemental metrics',
    hint: 'Extra context — never affects the score',
    metrics: v4Metrics.filter((m) => m.group === 'supplemental'),
  },
]

function one(value: number): string {
  return value.toFixed(1)
}

function ScoreLine({
  label,
  score,
  severity,
  emphasis,
}: {
  label: string
  score: number
  severity: Severity
  emphasis: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cx('text-xs', emphasis ? 'font-semibold text-ink' : 'text-muted')}>
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cx('font-mono text-sm', emphasis ? 'font-semibold text-ink' : 'text-muted')}
        >
          {one(score)}
        </span>
        <span
          className={cx(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
            severityClasses[severity],
          )}
        >
          {severity}
        </span>
      </span>
    </div>
  )
}

export default function CvssCalculator() {
  const [version, setVersion] = useState<CvssVersion>('4.0')
  const [v31Selection, setV31Selection] = useState<V31Selection>(defaultV31Selection)
  const [v4Selection, setV4Selection] = useState<V4Selection>(defaultV4Selection)
  // `null` means "show the canonical vector"; a string is the user's own edit.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  // The first sync must not write a hash: either the URL already carries one
  // (restored below) or the user has not touched anything yet.
  const skipHashWrite = useRef(true)

  const canonical = useMemo(
    () => (version === '4.0' ? formatV4(v4Selection) : formatV31(v31Selection)),
    [version, v4Selection, v31Selection],
  )

  const applyVector = useCallback((input: string): string | null => {
    if (!input.trim()) return 'Enter a CVSS vector string.'
    const head = input.trim().split('/', 1)[0].toUpperCase()
    try {
      if (head === 'CVSS:4.0') {
        const selection = parseV4(input)
        setV4Selection(selection)
        setVersion('4.0')
        setNotice(null)
        return null
      }
      if (head === 'CVSS:3.1' || head === 'CVSS:3.0') {
        const { selection, wasV30 } = parseV31(input)
        setV31Selection(selection)
        setVersion('3.1')
        setNotice(wasV30 ? V30_NOTE : null)
        return null
      }
    } catch (cause) {
      return cause instanceof CvssParseError ? cause.message : 'The vector could not be parsed.'
    }
    return `Segment 1 is "${input.trim().split('/', 1)[0]}" — the vector must start with "CVSS:4.0", "CVSS:3.1" or "CVSS:3.0".`
  }, [])

  // Restore state from the hash on mount, and follow browser back/forward.
  useEffect(() => {
    function readHash() {
      const result = parseHash(window.location.hash)
      if (result.kind === 'empty') return
      if (result.kind === 'invalid') {
        setNotice(`Ignored the link’s vector: ${result.message}`)
        return
      }
      if (result.kind === 'v4') {
        setV4Selection(result.selection)
        setVersion('4.0')
        setNotice(null)
      } else {
        setV31Selection(result.selection)
        setVersion('3.1')
        setNotice(result.wasV30 ? V30_NOTE : null)
      }
    }
    readHash()
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
  }, [])

  // The pickers are the source of truth: mirror them into the hash.
  useEffect(() => {
    if (skipHashWrite.current) {
      skipHashWrite.current = false
      return
    }
    const next = toHash(canonical)
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [canonical])

  // Typing or pasting into the field updates the pickers, debounced.
  useEffect(() => {
    if (draft === null) return
    const timer = setTimeout(() => {
      const message = applyVector(draft)
      setError(message)
      if (message === null) setDraft(null)
    }, 200)
    return () => clearTimeout(timer)
  }, [draft, applyVector])

  const groups = version === '4.0' ? v4Groups : v31Groups

  const activeGroups = useMemo((): Record<string, boolean> => {
    if (version === '4.0') {
      return {
        base: false,
        threat: hasGroupSet(v4Selection, 'threat'),
        environmental: hasGroupSet(v4Selection, 'environmental'),
        supplemental: hasGroupSet(v4Selection, 'supplemental'),
      }
    }
    return {
      base: false,
      temporal: hasTemporal(v31Selection),
      environmental: hasEnvironmental(v31Selection),
    }
  }, [version, v4Selection, v31Selection])

  function isOpen(id: string): boolean {
    const key = `${version}:${id}`
    if (key in overrides) return overrides[key]
    return id === 'base' || activeGroups[id]
  }

  function toggleGroup(id: string) {
    const key = `${version}:${id}`
    setOverrides((current) => ({ ...current, [key]: !isOpen(id) }))
  }

  function setMetric(key: string, value: string) {
    if (version === '4.0') setV4Selection((current) => ({ ...current, [key]: value }))
    else setV31Selection((current) => ({ ...current, [key]: value }))
    setDraft(null)
    setError(null)
    setNotice(null)
  }

  function reset() {
    if (version === '4.0') setV4Selection(defaultV4Selection())
    else setV31Selection(defaultV31Selection())
    setDraft(null)
    setError(null)
    setNotice(null)
  }

  const v4Result = useMemo(() => scoreV4(v4Selection), [v4Selection])
  const v31Result = useMemo(() => scoreV31(v31Selection), [v31Selection])

  const v31Temporal = hasTemporal(v31Selection)
  const v31Environmental = hasEnvironmental(v31Selection)

  const headline =
    version === '4.0'
      ? { score: v4Result.score, severity: v4Result.severity, label: v4Result.nomenclature }
      : v31Environmental
        ? {
            score: v31Result.environmental,
            severity: v31Result.severities[2],
            label: 'Environmental',
          }
        : v31Temporal
          ? { score: v31Result.temporal, severity: v31Result.severities[1], label: 'Temporal' }
          : { score: v31Result.base, severity: v31Result.severities[0], label: 'Base' }

  const scoreSummary =
    version === '4.0'
      ? `${one(v4Result.score)} ${v4Result.severity} (${v4Result.nomenclature}) ${canonical}`
      : `Base ${one(v31Result.base)} ${v31Result.severities[0]} / Temporal ${one(
          v31Result.temporal,
        )} ${v31Result.severities[1]} / Environmental ${one(v31Result.environmental)} ${
          v31Result.severities[2]
        } ${canonical}`

  function shareLink() {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() =>
        toast('Link copied — it contains only the vector string.', { variant: 'success' }),
      )
      .catch(() => toast('Could not access the clipboard.', { variant: 'error' }))
  }

  return (
    <ToolLayout
      title="CVSS calculator"
      description="Score vulnerabilities with CVSS v3.1 and v4.0 — exact FIRST equations, shareable by link"
      badge="client-side"
    >
      <div role="tablist" aria-label="CVSS version" className="mb-4 flex gap-1">
        {(
          [
            ['4.0', 'CVSS v4.0'],
            ['3.1', 'CVSS v3.1'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={version === value}
            onClick={() => {
              setVersion(value)
              setDraft(null)
              setError(null)
            }}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              version === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <label htmlFor="cvss-vector" className="text-xs font-semibold text-muted">
          Vector string
        </label>
        <input
          id="cvss-vector"
          value={draft ?? canonical}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'cvss-vector-error' : undefined}
          className={cx(
            'mt-1.5 w-full rounded-md border bg-page px-3 py-2 font-mono text-xs text-ink',
            error ? 'border-rose' : 'border-line-strong',
          )}
        />
        {error && (
          <p id="cvss-vector-error" role="alert" className="mt-1.5 text-xs text-rose">
            {error}
          </p>
        )}
        {!error && notice && <p className="mt-1.5 text-xs text-amber-badge">{notice}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={() => canonical} label="Copy vector" />
          <CopyButton text={() => scoreSummary} label="Copy score" />
          <Button variant="secondary" size="sm" onClick={shareLink}>
            <Link2 className="size-3.5" />
            Share link
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {groups.map((group) => (
            <MetricGroup
              key={`${version}-${group.id}`}
              title={group.title}
              hint={group.hint}
              metrics={group.metrics}
              selection={version === '4.0' ? v4Selection : v31Selection}
              onChange={setMetric}
              open={isOpen(group.id)}
              onToggle={() => toggleGroup(group.id)}
              active={activeGroups[group.id]}
            />
          ))}
        </div>

        <aside
          aria-live="polite"
          className="order-1 rounded-lg border border-line bg-card p-4 lg:order-2 lg:sticky lg:top-4"
        >
          <div className="flex flex-col items-center">
            <ScoreGauge score={headline.score} severity={headline.severity} />
            <p className="-mt-4 font-display text-4xl font-semibold text-ink">
              {one(headline.score)}
            </p>
            <p
              className={cx(
                'mt-2 rounded-full px-2.5 py-1 text-xs font-semibold',
                severityClasses[headline.severity],
              )}
            >
              {headline.severity}
            </p>
            <p className="mt-1 font-mono text-[11px] text-faint">
              {version === '4.0' ? v4Result.nomenclature : `CVSS v3.1 ${headline.label}`}
            </p>
          </div>

          {version === '3.1' && (
            <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
              <ScoreLine
                label="Base"
                score={v31Result.base}
                severity={v31Result.severities[0]}
                emphasis={!v31Temporal && !v31Environmental}
              />
              <ScoreLine
                label="Temporal"
                score={v31Result.temporal}
                severity={v31Result.severities[1]}
                emphasis={v31Temporal && !v31Environmental}
              />
              <ScoreLine
                label="Environmental"
                score={v31Result.environmental}
                severity={v31Result.severities[2]}
                emphasis={v31Environmental}
              />
            </div>
          )}

          <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 font-mono text-[11px] text-muted">
            {version === '4.0' ? (
              <div className="flex justify-between gap-2">
                <dt>Macro vector</dt>
                <dd className="text-ink">EQ {v4Result.macroVector}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between gap-2">
                  <dt>Impact</dt>
                  <dd className="text-ink">{one(v31Result.impact)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Exploitability</dt>
                  <dd className="text-ink">{one(v31Result.exploitability)}</dd>
                </div>
                {v31Environmental && (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt>Modified impact</dt>
                      <dd className="text-ink">{one(v31Result.modifiedImpact)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Modified exploitability</dt>
                      <dd className="text-ink">{one(v31Result.modifiedExploitability)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
          </dl>

          <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">
            Runs entirely in your browser. The link you copy contains only the vector string.
          </p>
        </aside>
      </div>
    </ToolLayout>
  )
}
