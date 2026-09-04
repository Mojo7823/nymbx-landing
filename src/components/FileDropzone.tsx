import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { File as FileIcon, FolderInput, UploadCloud, X } from 'lucide-react'
import { cx } from '../lib/cx'
import { formatBytes } from '../lib/format'
import { collectDroppedPaths, inputFilePath, type DroppedPath } from '../lib/dropFiles'

export interface FileDropzoneProps {
  /** Same syntax as `<input accept>`: extensions and/or MIME types. */
  accept?: string
  multiple?: boolean
  /** Max size per file, in bytes. */
  maxSize?: number
  onFiles?: (files: File[]) => void
  /**
   * Path-aware callback. When `folders` is enabled, dropped/picked folders
   * arrive here with paths relative to the drop (e.g. `photos/a.jpg`);
   * plain files report `file.name`. Also called for plain picks when set.
   */
  onPaths?: (files: DroppedPath[]) => void
  /**
   * Opt in to folder drops and a folder picker. Reported via `onPaths`
   * (and `onFiles` for compatibility). Off by default — existing tools
   * behave exactly as before.
   */
  folders?: boolean
  /** Extra hint under the main label, e.g. "PNG, JPEG or WebP". */
  hint?: string
  /**
   * Privacy microcopy under the hint. Server-assisted tools must override
   * the default so the dropzone never claims files stay local when they don't.
   */
  privacyNote?: string
  className?: string
}

function matchesAccept(file: File, accept: string): boolean {
  const rules = accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
  if (rules.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

export function FileDropzone({
  accept,
  multiple = false,
  maxSize,
  onFiles,
  onPaths,
  folders = false,
  hint,
  privacyNote = 'Stays on this device',
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  function takePaths(dropped: DroppedPath[]) {
    const items = multiple ? dropped : dropped.slice(0, 1)

    const wrongType = accept ? items.filter(({ file }) => !matchesAccept(file, accept)) : []
    const tooBig = maxSize ? items.filter(({ file }) => file.size > maxSize) : []
    const rejected = new Set([...wrongType, ...tooBig])
    const accepted = items.filter((item) => !rejected.has(item))

    if (wrongType.length > 0) {
      setError(`Unsupported file type: ${wrongType.map(({ file }) => file.name).join(', ')}`)
    } else if (tooBig.length > 0) {
      setError(
        `Larger than ${formatBytes(maxSize!)}: ${tooBig.map(({ file }) => file.name).join(', ')}`,
      )
    } else {
      setError(null)
    }

    setSelected(accepted.map(({ file }) => file))
    if (accepted.length > 0) {
      onFiles?.(accepted.map(({ file }) => file))
      onPaths?.(accepted)
    }
  }

  function takeFiles(list: FileList | File[]) {
    takePaths(Array.from(list).map((file) => ({ file, path: file.name })))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (folders) {
      const items = e.dataTransfer.items
      if (items && items.length > 0) {
        void collectDroppedPaths(e.dataTransfer)
          .then((paths) => {
            if (paths) takePaths(paths)
            else if (e.dataTransfer.files.length > 0) takeFiles(e.dataTransfer.files)
          })
          // A traversal failure must not swallow the drop — the flattened
          // file list is still available.
          .catch(() => {
            if (e.dataTransfer.files.length > 0) takeFiles(e.dataTransfer.files)
          })
        return
      }
    }
    if (e.dataTransfer.files.length > 0) takeFiles(e.dataTransfer.files)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  function clear() {
    setSelected([])
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    if (dirInputRef.current) dirInputRef.current.value = ''
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label={multiple ? 'Choose files or drag them here' : 'Choose a file or drag it here'}
        onClick={() => inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragActive ? 'border-pine bg-mint' : 'border-line-strong bg-card hover:border-pine/60',
        )}
      >
        <UploadCloud className={cx('size-8', dragActive ? 'text-pine' : 'text-faint')} />
        <p className="text-sm font-medium text-ink">
          {multiple ? 'Drop files here' : 'Drop a file here'}{' '}
          <span className="text-muted">or click to browse</span>
        </p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <p className="font-mono text-[10px] tracking-wide text-faint uppercase">{privacyNote}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) takeFiles(e.target.files)
          }}
        />
      </div>

      {folders && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => dirInputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-soft hover:text-ink"
          >
            <FolderInput className="size-3.5" />
            Or choose a whole folder
          </button>
          <input
            ref={(el) => {
              dirInputRef.current = el
              // React has no webkitdirectory prop — set the attribute directly.
              el?.setAttribute('webkitdirectory', '')
              el?.setAttribute('directory', '')
            }}
            type="file"
            accept={accept}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) {
                takePaths(
                  Array.from(e.target.files).map((file) => ({ file, path: inputFilePath(file) })),
                )
              }
              e.target.value = ''
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {selected.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {selected.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-sm"
            >
              <FileIcon className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
              <span className="font-mono text-xs text-muted">{formatBytes(file.size)}</span>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={clear}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-ink"
            >
              <X className="size-3" /> Clear selection
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
