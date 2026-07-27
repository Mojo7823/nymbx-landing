import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { ToolLayout } from '../../components/ToolLayout'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import type { CountWorkerApi } from './count.worker'
import { countText, type TextStats } from './count'

/** Above this size, counting moves off the main thread (1 MB ≈ 150–500 ms). */
const WORKER_THRESHOLD = 64 * 1024
const DEBOUNCE_MS = 150

const SAMPLE = `The NYMBX Toolbox runs entirely in your browser: no uploads, no tracking.

它也能正確計算中日韓文字：這一句的每個詞都由 Intl.Segmenter 切分，而不是用空格。

Emoji count as single characters: 👩‍👩‍👧‍👦 🇹🇼 🎉. Three graphemes, not a dozen code units!`

const EMPTY = countText('')

interface Tile {
  label: string
  value: (stats: TextStats) => string
  hint?: string
}

const TILES: Tile[] = [
  { label: 'Characters', value: (s) => s.graphemes.toLocaleString() },
  { label: 'Characters (no spaces)', value: (s) => s.graphemesNoSpaces.toLocaleString() },
  { label: 'Words', value: (s) => s.words.toLocaleString() },
  { label: 'Sentences', value: (s) => s.sentences.toLocaleString() },
  { label: 'Lines', value: (s) => s.lines.toLocaleString() },
  { label: 'Paragraphs', value: (s) => s.paragraphs.toLocaleString() },
  {
    label: 'Tokens (approx.)',
    value: (s) => (s.tokens === 0 ? '0' : `≈ ${s.tokens.toLocaleString()}`),
    hint: 'rough LLM estimate: ~4 latin chars or ~1 CJK char per token',
  },
  {
    label: 'Reading time',
    value: (s) =>
      s.readingMinutes === 0 ? '0 min' : s.words < 100 ? '< 1 min' : `~${s.readingMinutes} min`,
    hint: 'at 200 words per minute',
  },
]

export default function WordCounter() {
  const [text, setText] = useState('')
  const [stats, setStats] = useState<TextStats>(EMPTY)
  const [busy, setBusy] = useState(false)

  const workerRef = useRef<WorkerHandle<CountWorkerApi> | null>(null)
  const runIdRef = useRef(0)
  useEffect(() => () => workerRef.current?.terminate(), [])

  useEffect(() => {
    const id = ++runIdRef.current
    if (text.length <= WORKER_THRESHOLD) {
      // Cheap enough to stay fully live on the main thread.
      const timer = setTimeout(() => setStats(countText(text)), 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setBusy(true)
      workerRef.current ??= wrapWorker<CountWorkerApi>(
        new Worker(new URL('./count.worker.ts', import.meta.url), { type: 'module' }),
      )
      void workerRef.current.api
        .count(text)
        .then((result) => {
          if (runIdRef.current !== id) return
          setStats(result)
        })
        .finally(() => {
          if (runIdRef.current === id) setBusy(false)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <ToolLayout
      title="Word & character counter"
      description="Live counts of characters, words, sentences, lines and paragraphs (CJK-aware via Intl.Segmenter, emoji counted as single characters), plus rough token and reading-time estimates. Everything runs in your browser."
      badge="client-side"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(16rem,0.6fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <textarea
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type or paste text to count…"
            aria-label="Text input"
            spellCheck={false}
            className="h-80 w-full resize-y rounded-lg border border-line bg-card p-3 text-sm leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div>
            <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
        </div>

        <aside aria-label="Counts" aria-busy={busy}>
          <dl className="grid grid-cols-2 gap-2">
            {TILES.map((tile) => (
              <div
                key={tile.label}
                className="rounded-lg border border-line bg-card p-3"
                title={tile.hint}
              >
                <dt className="text-[11px] font-semibold text-muted">{tile.label}</dt>
                <dd className="mt-1 font-display text-xl font-semibold text-ink tabular-nums">
                  {tile.value(stats)}
                </dd>
                {tile.hint && (
                  <p className="mt-1 text-[10px] leading-tight text-faint">{tile.hint}</p>
                )}
              </div>
            ))}
          </dl>
          <p aria-live="polite" className="mt-2 h-4 text-right text-[11px] text-faint">
            {busy ? 'counting…' : ''}
          </p>
        </aside>
      </div>
    </ToolLayout>
  )
}
