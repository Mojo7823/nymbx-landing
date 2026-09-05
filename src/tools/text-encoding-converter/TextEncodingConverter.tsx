import { useCallback, useEffect, useRef, useState } from 'react'
import { transfer } from 'comlink'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { CandidateList } from './CandidateList'
import { ConvertPanel } from './ConvertPanel'
import { RepairPanel } from './RepairPanel'
import type { LineEndingOption, RoundTrip } from './convert'
import { outputFilename } from './filename'
import type { Candidate, Detection } from './detect'
import type { EncodingWorkerApi, Inspection } from './encoding.worker'
import type { Repair, Suggestion } from './mojibake'

const MAX_SIZE = 256 * 1024 * 1024
const AUTO = 'auto'

type Mode = 'convert' | 'repair'

interface LoadedFile {
  name: string
  size: number
}

/** A repair result together with the inputs that produced it. */
interface RepairState {
  input: string
  decodedAs: string
  actual: string
  result: Repair | null
  suggestions: Suggestion[] | null
}

export default function TextEncodingConverter() {
  const [mode, setMode] = useState<Mode>('convert')

  const [file, setFile] = useState<LoadedFile | null>(null)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [roundTripResult, setRoundTripResult] = useState<RoundTrip | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addBom, setAddBom] = useState(false)
  const [lineEndingOption, setLineEndingOption] = useState<LineEndingOption>('keep')

  const [garbled, setGarbled] = useState('')
  const [decodedAs, setDecodedAs] = useState(AUTO)
  const [actual, setActual] = useState(AUTO)
  const [repairState, setRepairState] = useState<RepairState | null>(null)

  const workerRef = useRef<WorkerHandle<EncodingWorkerApi> | null>(null)
  const inspectRunRef = useRef(0)
  const repairRunRef = useRef(0)
  const debouncedGarbled = useDebouncedValue(garbled, 200)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  const worker = useCallback(() => {
    workerRef.current ??= wrapWorker<EncodingWorkerApi>(
      new Worker(new URL('./encoding.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }, [])

  const inspect = useCallback(
    async (label: string) => {
      const run = ++inspectRunRef.current
      setBusy('Decoding…')
      setRoundTripResult(null)
      try {
        const api = worker()
        const result = await api.inspect(label)
        if (run !== inspectRunRef.current) return
        setInspection(result)
        setBusy(null)
        // The round-trip check re-encodes the whole text (seconds on a 50 MB
        // file), so it fills the badge in after the preview is already up.
        const check = await api.checkRoundTrip(label)
        if (run === inspectRunRef.current) setRoundTripResult(check)
      } catch {
        if (run === inspectRunRef.current) {
          setInspection(null)
          toast('Could not decode this file with that encoding.', { variant: 'error' })
        }
      } finally {
        if (run === inspectRunRef.current) setBusy(null)
      }
    },
    [worker],
  )

  async function openFile(files: File[]) {
    const picked = files[0]
    if (!picked) return
    inspectRunRef.current++
    setFile({ name: picked.name, size: picked.size })
    setDetection(null)
    setCandidates([])
    setSelected(null)
    setInspection(null)
    setRoundTripResult(null)
    setBusy('Detecting…')
    try {
      const bytes = await picked.arrayBuffer()
      const result = await worker().analyze(transfer(bytes, [bytes]))
      setDetection(result)
      setCandidates(result.candidates)
      setAddBom(result.bom === 'utf-8')
      const first = result.candidates[0]?.label ?? null
      setSelected(first)
      setBusy(null)
      if (first) await inspect(first)
    } catch {
      setBusy(null)
      toast('Could not read this file.', { variant: 'error' })
    }
  }

  function clearFile() {
    inspectRunRef.current++
    setFile(null)
    setDetection(null)
    setCandidates([])
    setSelected(null)
    setInspection(null)
    setRoundTripResult(null)
    setBusy(null)
    setAddBom(false)
    setLineEndingOption('keep')
    void workerRef.current?.api.clear()
  }

  function selectCandidate(label: string) {
    setSelected(label)
    void inspect(label)
  }

  async function pickEncoding(label: string) {
    if (candidates.some((candidate) => candidate.label === label)) {
      selectCandidate(label)
      return
    }
    try {
      const candidate = await worker().previewFor(label)
      setCandidates((current) => [...current, candidate])
      selectCandidate(label)
    } catch {
      toast('Could not preview that encoding.', { variant: 'error' })
    }
  }

  async function download() {
    if (!file || !selected) return
    setBusy('Converting…')
    try {
      const bytes = await worker().convert(selected, {
        bom: addBom,
        lineEndings: lineEndingOption,
      })
      // Re-wrap so the BlobPart type is exact (the Comlink return is
      // Uint8Array<ArrayBufferLike>).
      const out = new Uint8Array(bytes)
      downloadBlob(new Blob([out], { type: 'text/plain;charset=utf-8' }), outputFilename(file.name))
    } catch {
      toast('Could not convert this file.', { variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // Mojibake repair — debounced, in the worker. The result carries the inputs
  // it was computed for, so "busy" and staleness are derived rather than
  // toggled from inside the effect.
  useEffect(() => {
    const input = debouncedGarbled
    if (mode !== 'repair' || input.trim().length === 0) return
    const run = ++repairRunRef.current
    const api = worker()
    const task =
      decodedAs === AUTO || actual === AUTO
        ? api.suggest(input).then((found) => ({ result: null, suggestions: found }))
        : api
            .repair(input, decodedAs, actual)
            .then((result) => ({ result, suggestions: null as Suggestion[] | null }))
    task
      .then((value) => {
        if (run !== repairRunRef.current) return
        setRepairState({ input, decodedAs, actual, ...value })
      })
      .catch(() => {
        if (run !== repairRunRef.current) return
        setRepairState({ input, decodedAs, actual, result: null, suggestions: [] })
        toast('Could not repair this text with those encodings.', { variant: 'error' })
      })
  }, [debouncedGarbled, decodedAs, actual, mode, worker])

  const fresh =
    repairState !== null &&
    repairState.input === garbled &&
    repairState.decodedAs === decodedAs &&
    repairState.actual === actual
  const repairBusy = garbled.trim().length > 0 && !fresh
  const repairResult = fresh ? repairState.result : null
  const suggestions = fresh ? repairState.suggestions : null

  function applySuggestion(suggestion: Suggestion) {
    setDecodedAs(suggestion.decodedAs)
    setActual(suggestion.actual)
  }

  function downloadRepaired(text: string) {
    downloadBlob(
      new Blob([new Uint8Array(new TextEncoder().encode(text))], {
        type: 'text/plain;charset=utf-8',
      }),
      'repaired.txt',
    )
  }

  const empty = file !== null && detection !== null && detection.candidates.length === 0

  return (
    <ToolLayout
      title="Text encoding converter"
      description="Detect Big5, GBK, Shift_JIS, EUC-KR and other legacy encodings, convert to UTF-8, or undo mojibake"
      badge="client-side"
    >
      <div role="tablist" aria-label="Mode" className="mb-4 flex gap-1">
        {(
          [
            ['convert', 'Convert a file'],
            ['repair', 'Repair mojibake'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              mode === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'convert' ? (
        !file ? (
          <FileDropzone
            maxSize={MAX_SIZE}
            onFiles={(files) => void openFile(files)}
            hint="Any text file — .txt, .csv, .srt, .log, .sql, source code"
          />
        ) : (
          <div className="space-y-4">
            {busy === 'Detecting…' && <ProgressBar label="Detecting…" />}
            {empty ? (
              <section className="rounded-lg border border-line bg-card p-8 text-center">
                <p className="text-sm font-medium text-ink">The file is empty</p>
                <p className="mt-1 text-xs text-muted">There is nothing to decode or convert.</p>
                <button
                  type="button"
                  onClick={clearFile}
                  className="mt-4 cursor-pointer text-xs font-semibold text-pine hover:underline"
                >
                  Choose another file
                </button>
              </section>
            ) : (
              <>
                <ConvertPanel
                  fileName={file.name}
                  fileSize={file.size}
                  bom={detection?.bom ?? null}
                  looksBinary={detection?.looksBinary ?? false}
                  selectedLabel={selected}
                  inspection={inspection}
                  roundTrip={roundTripResult}
                  busy={busy === 'Detecting…' ? null : busy}
                  addBom={addBom}
                  onAddBomChange={setAddBom}
                  lineEndings={lineEndingOption}
                  onLineEndingsChange={setLineEndingOption}
                  onDownload={() => void download()}
                  onClear={clearFile}
                  candidateSlot={
                    candidates.length > 0 && (
                      <CandidateList
                        candidates={candidates}
                        selected={selected}
                        onSelect={selectCandidate}
                        onPick={(label) => void pickEncoding(label)}
                        disabled={busy === 'Detecting…'}
                      />
                    )
                  }
                />
              </>
            )}
          </div>
        )
      ) : (
        <RepairPanel
          garbled={garbled}
          onGarbledChange={setGarbled}
          decodedAs={decodedAs}
          onDecodedAsChange={setDecodedAs}
          actual={actual}
          onActualChange={setActual}
          busy={repairBusy}
          result={repairResult}
          suggestions={suggestions}
          onUseSuggestion={applySuggestion}
          onDownload={downloadRepaired}
        />
      )}
    </ToolLayout>
  )
}
