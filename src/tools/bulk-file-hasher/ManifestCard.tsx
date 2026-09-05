import { useState } from 'react'
import { ClipboardList, FileCheck2, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { cx } from '../../lib/cx'
import type { AlgorithmId } from './hashEngine'
import { algorithmLabels } from './hashLogic'
import { formatLabels, type Manifest } from './manifest'

export interface ManifestCandidate {
  id: number
  path: string
  name: string
  manifest: Manifest
}

export interface ManifestCardProps {
  manifest: Manifest | null
  /** Manifest files in the drop that could be adopted instead. */
  candidates: ManifestCandidate[]
  /** Algorithms the manifest needs that are currently unticked. */
  missingAlgorithms: AlgorithmId[]
  pasteOpen: boolean
  pasteText: string
  /** Inline note under the textarea, e.g. when nothing parsed. */
  pasteNote?: string
  onPasteToggle: () => void
  onPasteChange: (text: string) => void
  onChooseFile: (file: File) => void
  onAdopt: (candidate: ManifestCandidate) => void
  onRemove: () => void
  onEnableAlgorithms: () => void
}

export function ManifestCard({
  manifest,
  candidates,
  missingAlgorithms,
  pasteOpen,
  pasteText,
  pasteNote,
  onPasteToggle,
  onPasteChange,
  onChooseFile,
  onAdopt,
  onRemove,
  onEnableAlgorithms,
}: ManifestCardProps) {
  const [showWarnings, setShowWarnings] = useState(false)
  const supported = manifest ? manifest.algorithms : []
  const unsupportedTags = manifest
    ? [...new Set(manifest.entries.filter((e) => e.algorithm === null).map((e) => e.tag ?? '?'))]
    : []

  if (manifest) {
    const entryWord = manifest.entries.length === 1 ? 'entry' : 'entries'
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line-strong bg-soft p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileCheck2 className="size-4 shrink-0 text-pine" />
          <span className="text-xs font-semibold text-ink">Manifest: {manifest.name}</span>
          <span className="font-mono text-[11px] text-muted">
            {formatLabels[manifest.format]} ·{' '}
            {supported.length > 0
              ? supported.map((a) => algorithmLabels[a]).join(', ')
              : 'no supported algorithm'}{' '}
            · {manifest.entries.length} {entryWord}
          </span>
          {manifest.warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowWarnings((v) => !v)}
              className="cursor-pointer rounded-full border border-amber-badge/40 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-badge"
              aria-expanded={showWarnings}
            >
              {manifest.warnings.length} {manifest.warnings.length === 1 ? 'warning' : 'warnings'}
            </button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="size-3.5" />
            Remove manifest
          </Button>
        </div>

        {showWarnings && manifest.warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 font-mono text-[11px] text-amber-badge">
            {manifest.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {supported.length === 0 && unsupportedTags.length > 0 && (
          <p className="text-xs text-amber-badge">
            This manifest uses {unsupportedTags.join(', ')}, which this tool cannot compute.
          </p>
        )}

        {missingAlgorithms.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-amber-badge">
            {missingAlgorithms.map((a) => algorithmLabels[a]).join(', ')}{' '}
            {missingAlgorithms.length === 1 ? 'is' : 'are'} needed for this manifest
            <Button variant="secondary" size="sm" onClick={onEnableAlgorithms}>
              Enable
            </Button>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-medium text-muted">Verify against a manifest</span>
        <label
          className={cx(
            'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5',
            'text-xs font-medium text-ink transition-colors hover:border-pine/60',
          )}
        >
          <FileCheck2 className="size-3.5 text-faint" />
          Choose checksum file
          <input
            type="file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onChooseFile(file)
              e.target.value = ''
            }}
          />
        </label>
        <Button variant="secondary" size="sm" onClick={onPasteToggle} aria-expanded={pasteOpen}>
          <ClipboardList className="size-3.5" />
          Paste manifest
        </Button>
      </div>

      {pasteOpen && (
        <textarea
          value={pasteText}
          onChange={(e) => onPasteChange(e.target.value)}
          rows={5}
          spellCheck={false}
          aria-label="Manifest text"
          placeholder={'9c85…  bin/tool.wasm\n— or —\nSHA256 (bin/tool.wasm) = 9c85…'}
          className="w-full rounded-md border border-line-strong bg-card p-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
        />
      )}

      {pasteOpen && pasteNote && <p className="text-xs text-amber-badge">{pasteNote}</p>}

      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Checksum files in this drop:</span>
          {candidates.map((candidate) => (
            <Button
              key={candidate.id}
              variant="secondary"
              size="sm"
              onClick={() => onAdopt(candidate)}
            >
              Use {candidate.name}
            </Button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted">
        SHA256SUMS, *.sha256, *.md5, *.sha1, BSD “SHA256 (file) = …” and OpenSSL styles. Dropping a
        checksum file together with your files also works.
      </p>
    </div>
  )
}
