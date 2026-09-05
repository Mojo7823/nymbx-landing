import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { toast } from '../../lib/toast'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { ComponentsTable } from './ComponentsTable'
import { DependencyTree } from './DependencyTree'
import {
  UNKNOWN_FORMAT_MESSAGE,
  XML_NOT_VALIDATED,
  fileStem,
  parseXml,
  sniffInput,
  type AnalyzeResult,
} from './detect'
import {
  dependencyTree,
  licenseSummary,
  normalizeCycloneDxXml,
  severityRank,
  type SbomDocument,
} from './model'
import { formatReport, type ValidationResult } from './report'
import type { SbomWorkerApi } from './sbom.worker'

const MAX_FILE_SIZE = 50 * 1024 * 1024

const ACCEPT = '.json,.xml,.cdx.json,.spdx.json,.bom.json,application/json,text/xml,application/xml'

type TabId = 'components' | 'licenses' | 'dependencies' | 'vulnerabilities' | 'validation'

interface Loaded {
  /** File name, or "Pasted document". */
  name: string
  stem: string
  size: number
  doc: SbomDocument
  validation: ValidationResult
  elapsedMs: number
}

function formatTimestamp(raw: string): string {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  )
}

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'border-rose bg-rose-soft text-rose',
  high: 'border-rose/50 bg-rose-soft text-rose',
  medium: 'border-amber-badge/40 bg-amber-soft text-amber-badge',
  low: 'border-line-strong bg-soft text-muted',
  info: 'border-line-strong bg-soft text-muted',
  none: 'border-line-strong bg-soft text-muted',
  unknown: 'border-line-strong bg-soft text-faint',
}

function SeverityBadge({ severity }: { severity: string }) {
  const key = severity.toLowerCase()
  return (
    <span
      className={cx(
        'inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        SEVERITY_CLASSES[key] ?? SEVERITY_CLASSES.unknown,
      )}
    >
      {severity}
    </span>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="font-mono text-sm text-ink tabular-nums">{value}</dd>
    </div>
  )
}

function ValidationBadge({ validation }: { validation: ValidationResult }) {
  if (validation.valid === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pine/30 bg-mint/40 px-2.5 py-1 text-xs font-semibold text-pine">
        <CheckCircle2 className="size-3.5" />
        Valid against {validation.schema} schema
      </span>
    )
  }
  if (validation.valid === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose bg-rose-soft px-2.5 py-1 text-xs font-semibold text-rose">
        <ShieldAlert className="size-3.5" />
        {validation.totalErrors.toLocaleString()} schema{' '}
        {validation.totalErrors === 1 ? 'error' : 'errors'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-soft px-2.5 py-1 text-xs font-semibold text-muted">
      Not validated
    </span>
  )
}

export default function SbomViewer() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [tab, setTab] = useState<TabId>('components')
  const [treeWanted, setTreeWanted] = useState(false)
  function selectTab(next: TabId) {
    setTab(next)
    if (next === 'dependencies') setTreeWanted(true)
  }
  const [openLicense, setOpenLicense] = useState<string | null>(null)
  const workerRef = useRef<WorkerHandle<SbomWorkerApi> | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  function worker() {
    workerRef.current ??= wrapWorker<SbomWorkerApi>(
      new Worker(new URL('./sbom.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }

  async function analyze(text: string, name: string, size: number) {
    setError(null)
    setBusy(true)
    setTreeWanted(false)
    setLoaded(null)
    const started = performance.now()
    try {
      const kind = sniffInput(text)
      let result: AnalyzeResult
      if (kind === 'xml') {
        // Workers have no DOMParser, so XML is parsed here — and, lacking an
        // XSD validator, it is not schema-validated.
        const parsed = parseXml(text)
        result = parsed.ok
          ? {
              ok: true,
              doc: normalizeCycloneDxXml(parsed.doc),
              validation: {
                schema: null,
                valid: null,
                errors: [],
                totalErrors: 0,
                note: XML_NOT_VALIDATED,
              },
            }
          : { ok: false, kind: 'xml', message: parsed.message }
      } else if (kind === 'json') {
        result = await worker().analyzeJson(text)
      } else {
        result = {
          ok: false,
          kind: 'format',
          message: `This does not look like JSON or XML. ${UNKNOWN_FORMAT_MESSAGE}`,
        }
      }

      if (!result.ok) {
        setError(result.message)
        return
      }
      selectTab('components')
      setOpenLicense(null)
      setTreeWanted(false)
      setLoaded({
        name,
        stem: fileStem(name),
        size,
        doc: result.doc,
        validation: result.validation,
        elapsedMs: Math.round(performance.now() - started),
      })
    } catch {
      setError('Could not analyze this document.')
    } finally {
      setBusy(false)
    }
  }

  async function openFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    await analyze(await file.text(), file.name, file.size)
  }

  function reset() {
    setTreeWanted(false)
    setLoaded(null)
    setError(null)
    setPaste('')
  }

  const doc = loaded?.doc
  const licenses = useMemo(() => (doc ? licenseSummary(doc.components) : []), [doc])
  // Building the tree for a 10k-component document costs ~1 s of main-thread
  // time; do it only once the Dependencies tab is actually opened.
  const tree = useMemo(() => (doc && treeWanted ? dependencyTree(doc) : null), [doc, treeWanted])
  const vulnerabilities = useMemo(
    () =>
      doc
        ? [...doc.vulnerabilities].sort(
            (a, b) => severityRank(a.severity) - severityRank(b.severity),
          )
        : [],
    [doc],
  )
  const componentNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const component of doc?.components ?? []) {
      if (component.ref) map.set(component.ref, component.name)
    }
    return map
  }, [doc])
  const withoutLicense = doc
    ? doc.components.filter((component) => component.licenses.length === 0).length
    : 0
  const dependencyEdges = doc
    ? [...doc.dependencies.values()].reduce((sum, list) => sum + list.length, 0)
    : 0

  const tabs: { id: TabId; label: string; badge?: number; danger?: boolean }[] = [
    { id: 'components', label: 'Components', badge: doc?.components.length },
    { id: 'licenses', label: 'Licenses', badge: licenses.length },
    { id: 'dependencies', label: 'Dependencies', badge: dependencyEdges },
    ...(vulnerabilities.length > 0
      ? [
          {
            id: 'vulnerabilities' as const,
            label: 'Vulnerabilities',
            badge: vulnerabilities.length,
            danger: true,
          },
        ]
      : []),
    {
      id: 'validation',
      label: 'Validation',
      badge: loaded?.validation.totalErrors,
      danger: loaded?.validation.valid === false,
    },
  ]

  return (
    <ToolLayout
      title="SBOM viewer"
      description="Inspect and validate CycloneDX and SPDX software bills of materials, in your browser"
      badge="client-side"
    >
      {!loaded ? (
        <div className="mx-auto max-w-3xl">
          {busy ? (
            <ProgressBar label="Analyzing document" />
          ) : (
            <>
              <FileDropzone
                accept={ACCEPT}
                maxSize={MAX_FILE_SIZE}
                onFiles={(files) => void openFiles(files)}
                onReject={(files) =>
                  toast(
                    `${files[0]?.name ?? 'That file'} is not a JSON or XML SBOM under ${formatBytes(MAX_FILE_SIZE)}.`,
                    { variant: 'error' },
                  )
                }
                hint="CycloneDX JSON or XML, or SPDX 2.x JSON — up to 50 MB"
              />
              <p className="mt-2 text-center text-xs text-muted">
                Stays in your browser. Schemas are bundled, so nothing is fetched while you inspect
                a file.
              </p>

              <div className="mt-6">
                <label
                  htmlFor="sbom-paste"
                  className="text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  Or paste SBOM JSON or XML
                </label>
                <textarea
                  id="sbom-paste"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  spellCheck={false}
                  rows={6}
                  placeholder={'{\n  "bomFormat": "CycloneDX",\n  "specVersion": "1.6",\n  …\n}'}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-card p-3 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
                />
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={paste.trim() === ''}
                  onClick={() => void analyze(paste, 'Pasted document', new Blob([paste]).size)}
                >
                  Analyze pasted text
                </Button>
              </div>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-rose bg-rose-soft px-3 py-2 text-sm text-rose"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="rounded-md border border-pine/30 bg-mint/40 px-2.5 py-1 text-xs font-semibold text-pine">
                {loaded.doc.format} {loaded.doc.specVersion || '(version missing)'}
              </span>
              <ValidationBadge validation={loaded.validation} />
              <div className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  {formatBytes(loaded.size)} · {loaded.elapsedMs} ms
                </span>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <Trash2 className="size-3.5" />
                  Choose another
                </Button>
              </div>
            </div>

            <h2 className="mt-3 font-display text-lg font-semibold text-ink">
              {loaded.doc.subject
                ? `${loaded.doc.subject.name}${loaded.doc.subject.version ? ` ${loaded.doc.subject.version}` : ''}`
                : loaded.name}
            </h2>
            {loaded.doc.subject && <p className="truncate text-xs text-muted">{loaded.name}</p>}

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryStat
                label="Components"
                value={loaded.doc.components.length.toLocaleString()}
              />
              <SummaryStat label="Dependency edges" value={dependencyEdges.toLocaleString()} />
              <SummaryStat label="Licenses" value={licenses.length.toLocaleString()} />
              <SummaryStat
                label="Vulnerabilities"
                value={vulnerabilities.length.toLocaleString()}
              />
              <div>
                <dt className="text-[11px] tracking-wide text-faint uppercase">Created</dt>
                <dd className="text-sm text-ink" title={loaded.doc.created ?? ''}>
                  {loaded.doc.created ? formatTimestamp(loaded.doc.created) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-faint uppercase">Tools</dt>
                <dd className="text-sm text-ink">
                  {loaded.doc.tools.length > 0 ? loaded.doc.tools.join(', ') : '—'}
                </dd>
              </div>
            </dl>

            {loaded.doc.serialNumber && (
              <p className="overflow-wrap-anywhere mt-3 border-t border-line pt-3 font-mono text-[11px] text-faint">
                {loaded.doc.serialNumber}
              </p>
            )}

            {loaded.doc.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {loaded.doc.warnings.map((warning) => (
                  <li key={warning} className="flex items-center gap-1.5 text-xs text-amber-badge">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div
            role="tablist"
            aria-label="SBOM sections"
            className="mt-5 mb-4 flex flex-wrap gap-1 overflow-x-auto"
          >
            {tabs.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => selectTab(entry.id)}
                className={cx(
                  'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  tab === entry.id
                    ? 'bg-mint text-pine'
                    : 'text-muted hover:bg-soft hover:text-ink',
                )}
              >
                {entry.label}
                {entry.badge !== undefined && entry.badge > 0 && (
                  <span
                    className={cx(
                      'rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums',
                      entry.danger ? 'bg-rose-soft text-rose' : 'bg-soft text-muted',
                    )}
                  >
                    {entry.badge.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'components' && (
            <ComponentsTable components={loaded.doc.components} stem={loaded.stem} />
          )}

          {tab === 'licenses' && (
            <div>
              <p className="mb-3 text-xs text-muted">
                {licenses.length.toLocaleString()} distinct{' '}
                {licenses.length === 1 ? 'license' : 'licenses'} · {withoutLicense.toLocaleString()}{' '}
                {withoutLicense === 1 ? 'component' : 'components'} without license information.
                Expressions are listed as written.
              </p>
              <ul className="divide-y divide-line rounded-lg border border-line bg-card">
                {licenses.map((entry) => (
                  <li key={entry.license}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenLicense(openLicense === entry.license ? null : entry.license)
                      }
                      aria-expanded={openLicense === entry.license}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-soft"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                        {entry.license}
                      </span>
                      <span className="font-mono text-xs text-muted tabular-nums">
                        {entry.count.toLocaleString()}
                      </span>
                    </button>
                    {openLicense === entry.license && (
                      <ul className="border-t border-line bg-soft px-4 py-2">
                        {entry.components.map((name, i) => (
                          <li key={`${name}-${i}`} className="font-mono text-[11px] text-muted">
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'dependencies' && tree && <DependencyTree tree={tree} />}

          {tab === 'vulnerabilities' && (
            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full min-w-[44rem] text-left text-xs">
                <thead className="border-b border-line bg-soft text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">Severity</th>
                    <th className="px-3 py-2 font-semibold">Score</th>
                    <th className="px-3 py-2 font-semibold">Affects</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {vulnerabilities.map((vulnerability, i) => (
                    <tr key={`${vulnerability.id}-${i}`} className="align-top">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-ink">
                        {vulnerability.url ? (
                          <a
                            href={vulnerability.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-pine hover:underline"
                          >
                            {vulnerability.id}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          vulnerability.id
                        )}
                        {vulnerability.source && (
                          <span className="block text-[10px] text-faint">
                            {vulnerability.source}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <SeverityBadge severity={vulnerability.severity} />
                      </td>
                      <td className="px-3 py-2 font-mono text-muted tabular-nums">
                        {vulnerability.score ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">
                        {vulnerability.affects.length === 0
                          ? '—'
                          : vulnerability.affects
                              .map((ref) => componentNames.get(ref) ?? ref)
                              .join(', ')}
                      </td>
                      <td className="max-w-md px-3 py-2 text-muted">
                        {vulnerability.description || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'validation' && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ValidationBadge validation={loaded.validation} />
                <CopyButton label="Copy report" text={() => formatReport(loaded.validation)} />
              </div>
              {loaded.validation.valid === null && (
                <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
                  {loaded.validation.note ?? 'This document was not validated.'}
                </p>
              )}
              {loaded.validation.valid === true && (
                <p className="flex items-center gap-2 rounded-lg border border-pine/30 bg-mint/40 p-4 text-sm text-pine">
                  <CheckCircle2 className="size-4" />
                  No schema errors: this document conforms to the {loaded.validation.schema} JSON
                  schema.
                </p>
              )}
              {loaded.validation.valid === false && (
                <ul className="divide-y divide-line rounded-lg border border-line bg-card">
                  {loaded.validation.errors.map((entry, i) => (
                    <li
                      key={`${entry.path}-${entry.keyword}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2 text-xs"
                    >
                      <code className="font-mono text-ink">{entry.path}</code>
                      <span className="text-muted">— {entry.message}</span>
                      <span className="rounded border border-line bg-soft px-1.5 py-px font-mono text-[10px] text-faint">
                        {entry.keyword}
                      </span>
                    </li>
                  ))}
                  {loaded.validation.totalErrors > loaded.validation.errors.length && (
                    <li className="px-4 py-2 text-xs text-faint">
                      …{' '}
                      {(
                        loaded.validation.totalErrors - loaded.validation.errors.length
                      ).toLocaleString()}{' '}
                      more errors not shown
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
