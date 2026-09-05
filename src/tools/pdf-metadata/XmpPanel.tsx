import { useMemo } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { formatBytes } from '../../lib/format'
import { parseXmp } from './xmp'

export type XmpMode = 'keep' | 'regenerate' | 'remove'

export interface XmpPanelProps {
  /** The catalog packet, or `null` when the file has none. */
  xmp: string | null
  xmpBytes: number
  mode: XmpMode
  onMode: (mode: XmpMode) => void
  busy: boolean
  /** Page/XObject XMP streams that will keep their old values (0 when they are being removed). */
  staleCopies?: number
}

export function XmpPanel({ xmp, xmpBytes, mode, onMode, busy, staleCopies = 0 }: XmpPanelProps) {
  const parsed = useMemo(() => (xmp === null ? null : parseXmp(xmp)), [xmp])

  const options: { value: XmpMode; label: string }[] = xmp
    ? [
        { value: 'keep', label: 'Keep as is' },
        { value: 'regenerate', label: 'Update to match the fields above' },
        { value: 'remove', label: 'Remove' },
      ]
    : [
        { value: 'keep', label: 'Don’t add' },
        { value: 'regenerate', label: 'Create from the fields above' },
      ]

  return (
    <section className="mb-4 rounded-lg border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">XMP metadata</h2>
      <p className="mt-1 text-xs text-muted">
        The XML metadata packet. Many tools read it in preference to the Info dictionary, so the two
        can disagree.
      </p>

      {xmp === null || parsed === null ? (
        <p className="mt-3 text-sm text-muted">No XMP packet.</p>
      ) : (
        <>
          {parsed.error && (
            <p role="alert" className="mt-3 text-xs text-amber-badge">
              {parsed.error} — the raw packet is shown below.
            </p>
          )}
          {parsed.properties.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold tracking-widest text-muted uppercase">
                    <th className="py-1 pr-3 font-semibold">Property</th>
                    <th className="py-1 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.properties.map((property, index) => (
                    <tr key={`${property.name}-${index}`} className="border-t border-line">
                      <td className="py-1 pr-3 align-top font-mono whitespace-nowrap text-muted">
                        {property.name}
                      </td>
                      <td className="py-1 align-top break-words text-ink">{property.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
              Raw packet ({formatBytes(xmpBytes)})
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <CopyButton text={xmp} label="Copy packet" />
              </div>
              {/* textContent only — an XMP packet is user-controlled XML. */}
              <pre className="max-h-80 overflow-auto rounded-md border border-line bg-soft p-3 font-mono text-[11px] whitespace-pre-wrap text-ink">
                {xmp}
              </pre>
            </div>
          </details>
        </>
      )}

      <fieldset className="mt-4 border-t border-line pt-3">
        <legend className="sr-only">XMP packet</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-xs text-ink">
              <input
                type="radio"
                name="xmp-mode"
                value={option.value}
                checked={mode === option.value}
                disabled={busy}
                onChange={() => onMode(option.value)}
                className="size-3.5 cursor-pointer accent-(--color-pine)"
              />
              {option.label}
            </label>
          ))}
        </div>
        {mode === 'regenerate' && staleCopies > 0 && (
          <p className="mt-2 text-[11px] text-muted">
            {staleCopies} more XMP {staleCopies === 1 ? 'stream' : 'streams'} on pages/images
            {staleCopies === 1 ? ' keeps' : ' keep'} the old values — tick “Remove additional XMP
            streams” below to clear them too.
          </p>
        )}
      </fieldset>
    </section>
  )
}
