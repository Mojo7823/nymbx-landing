import { useEffect, useRef, useState } from 'react'
import { Download, Paintbrush, RotateCcw } from 'lucide-react'
import { removeBackground, type Config } from '@imgly/background-removal'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { describeProgress, type ProgressInfo } from './progress'
import { checkerboard } from './checkerboard'
import { FineTuneEditor } from './FineTuneEditor'

type Model = 'small' | 'medium'
type Phase = 'idle' | 'working' | 'done' | 'tune' | 'error'

const modelOptions: { id: Model; label: string; hint: string }[] = [
  { id: 'small', label: 'Fast', hint: '~44 MB model, quicker download and processing' },
  { id: 'medium', label: 'Quality', hint: '~88 MB model, better edges (hair, fur)' },
]

function buildConfig(model: Model, onProgress: Config['progress']): Config {
  return {
    publicPath: `${window.location.origin}/models/`,
    model,
    proxyToWorker: true,
    progress: onProgress,
  }
}

let nextRun = 1

export default function BackgroundRemover() {
  const [model, setModel] = useState<Model>('small')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [source, setSource] = useState<{ file: File; url: string } | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef(0)

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url)
      if (result) URL.revokeObjectURL(result.url)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
    [],
  )

  async function process(file: File) {
    const run = (runRef.current = nextRun++)
    setPhase('working')
    setError(null)
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setSource((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
    setProgress({ label: 'Preparing…', percent: 0 })

    const onProgress = (key: string, current: number, total: number) => {
      if (runRef.current === run) setProgress(describeProgress(key, current, total))
    }

    try {
      const blob = await removeBackground(file, buildConfig(model, onProgress))
      if (runRef.current !== run) return
      const stem = file.name.replace(/\.[^.]+$/, '')
      setResult({ blob, url: URL.createObjectURL(blob), name: `${stem}-no-background.png` })
      setPhase('done')
    } catch (err) {
      if (runRef.current !== run) return
      console.error(err)
      setPhase('error')
      setError(
        'Background removal failed. Very large images can run out of memory. Try a smaller copy, or reload and use the Fast model.',
      )
    } finally {
      if (runRef.current === run) setProgress(null)
    }
  }

  function reset() {
    runRef.current = 0
    setPhase('idle')
    setError(null)
    setProgress(null)
    setSource((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  const busy = phase === 'working'

  return (
    <ToolLayout
      title="Background remover"
      description="Remove the background from a photo with an AI model that runs entirely in your browser; the image never leaves this device."
      badge="client-side"
    >
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-4">
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Model quality</legend>
          <span className="text-xs font-medium text-muted">Model</span>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {modelOptions.map((m) => (
              <label
                key={m.id}
                title={m.hint}
                className={cx(
                  'px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                  model === m.id ? 'bg-pine text-page' : 'bg-card text-muted',
                  busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-mint',
                )}
              >
                <input
                  type="radio"
                  name="bg-model"
                  value={m.id}
                  checked={model === m.id}
                  disabled={busy}
                  onChange={() => setModel(m.id)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-faint">
          First use downloads only the selected model (~{model === 'small' ? '44' : '88'} MB) and
          the required AI runtime from this site; both are cached for next time. Your photo is
          processed locally.
        </p>
      </div>

      {phase === 'idle' && (
        <FileDropzone
          accept="image/*"
          onFiles={(files) => {
            if (files[0]) void process(files[0])
          }}
          hint="PNG, JPEG or WebP. One photo at a time"
        />
      )}

      {busy && (
        <div className="rounded-lg border border-line bg-card p-6">
          {source && (
            <img
              src={source.url}
              alt="Original"
              className="mx-auto mb-4 max-h-[40vh] max-w-full rounded-md opacity-60"
            />
          )}
          <ProgressBar
            className="mx-auto max-w-md"
            value={progress?.percent ?? undefined}
            label={progress?.label ?? 'Working…'}
          />
        </div>
      )}

      {phase === 'done' && source && result && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <figure>
              <figcaption className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Original
              </figcaption>
              <div className="flex items-center justify-center rounded-lg border border-line bg-page p-2">
                <img
                  src={source.url}
                  alt={`Original ${source.file.name}`}
                  className="max-h-[60vh] max-w-full rounded-md object-contain"
                />
              </div>
            </figure>
            <figure>
              <figcaption className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Background removed
              </figcaption>
              <div
                className="flex items-center justify-center rounded-lg border border-line p-2"
                style={checkerboard}
              >
                <img
                  src={result.url}
                  alt={`${source.file.name} with background removed`}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              </div>
            </figure>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => downloadBlob(result.blob, result.name)}>
              <Download className="size-4" />
              Download PNG
            </Button>
            <span className="font-mono text-xs text-muted tabular-nums">
              {formatBytes(result.blob.size)}
            </span>
            <Button variant="secondary" onClick={() => setPhase('tune')}>
              <Paintbrush className="size-4" />
              Fine-tune
            </Button>
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="size-4" />
              Another image
            </Button>
          </div>
        </>
      )}

      {phase === 'tune' && source && result && (
        <FineTuneEditor
          key={result.url}
          sourceUrl={source.url}
          resultBlob={result.blob}
          onApply={(blob) => {
            setResult((prev) => {
              if (prev) URL.revokeObjectURL(prev.url)
              return {
                blob,
                url: URL.createObjectURL(blob),
                name: prev ? prev.name : 'image-no-background.png',
              }
            })
            setPhase('done')
          }}
          onCancel={() => setPhase('done')}
        />
      )}

      {phase === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
          <Button variant="secondary" className="mt-3" onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
        </div>
      )}
    </ToolLayout>
  )
}
