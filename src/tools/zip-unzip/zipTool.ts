/**
 * Archive engine for the Zip / unzip tool: list and selectively extract
 * entries from a Blob, and build new archives. All reads are sliced, and
 * extraction only starts streams for wanted entries (per fflate's streaming
 * `Unzip` guidance), so multi-GB archives never load fully into memory —
 * only the selected outputs accumulate.
 *
 * These functions run inside the tool's Web Worker (`zipTool.worker.ts`);
 * they take/return cloneable values only. They are also imported directly
 * by unit tests (jsdom provides Blob).
 */

import { Unzip, UnzipInflate } from 'fflate'
import { streamZip, ZIP_CHUNK_SIZE, type ZipInput } from '../../lib/zipStream'
import {
  concatBytes,
  findEndOfCentralDirectory,
  parseCentralDirectory,
  sanitizeEntryName,
  type ZipEntryInfo,
} from './zipEntries'

/** The end-of-central-directory record always sits in the last 64 KiB + 22 B. */
export const ZIP_TAIL_MAX = 65535 + 22

/**
 * Extract slice size. fflate advises keeping the file count per pushed
 * chunk modest (many tiny files per chunk can hit stack limits), so this
 * stays at 1 MiB rather than the 8 MiB used when creating archives.
 */
export const EXTRACT_SLICE = 1024 * 1024

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer())
}

/** List entries (with sizes and flags) without decompressing anything. */
export async function listArchive(blob: Blob): Promise<ZipEntryInfo[]> {
  if (blob.size < 22) throw new Error('Not a zip archive: the file is too small.')
  const tailSize = Math.min(blob.size, ZIP_TAIL_MAX)
  const tail = await readSlice(blob, blob.size - tailSize, blob.size)
  const meta = findEndOfCentralDirectory(tail)
  if (meta.entryCount === 0) return []
  if (meta.cdOffset + meta.cdSize > blob.size) {
    throw new Error('This zip archive looks truncated.')
  }
  const cd = await readSlice(blob, meta.cdOffset, meta.cdOffset + meta.cdSize)
  return parseCentralDirectory(cd, meta.entryCount)
}

export interface ExtractedFile {
  name: string
  data: Uint8Array
}

export interface ExtractError {
  name: string
  message: string
}

export interface ExtractResult {
  files: ExtractedFile[]
  errors: ExtractError[]
}

/**
 * Stream-extract `wanted` entries (sanitized in-archive names) from `blob`.
 * Unwanted entries are never started, so their bytes flow past without
 * decompressing. Per-file failures are collected — one bad entry never
 * aborts the rest.
 */
export async function extractEntries(
  blob: Blob,
  wanted: string[],
  onProgress?: (bytesDone: number) => void,
): Promise<ExtractResult> {
  const want = new Set(wanted.filter((name) => name !== '' && !name.endsWith('/')))
  if (blob.size === 0) throw new Error('Not a zip archive: the file is empty.')
  if (want.size === 0) return { files: [], errors: [] }

  const parts = new Map<string, Uint8Array[]>()
  const started = new Set<string>()
  const finished = new Set<string>()
  const errors: ExtractError[] = []

  await new Promise<void>((resolve, reject) => {
    const unzipper = new Unzip()
    unzipper.register(UnzipInflate)
    unzipper.onfile = (file) => {
      // The listing shows sanitized names — match the same form here so
      // `../` tricks can never escape, and duplicates collapse safely.
      const name = sanitizeEntryName(file.name)
      if (name === '' || name.endsWith('/') || !want.has(name)) return
      if (parts.has(name)) {
        errors.push({ name, message: 'Duplicate entry in the archive; skipped.' })
        return
      }
      const chunks: Uint8Array[] = []
      parts.set(name, chunks)
      started.add(name)
      file.ondata = (err, dat, final) => {
        if (err) {
          errors.push({ name, message: err.message || 'Decompression failed.' })
          parts.delete(name)
          return
        }
        chunks.push(dat)
        if (final) finished.add(name)
      }
      try {
        file.start()
      } catch (err) {
        parts.delete(name)
        errors.push({
          name,
          message: err instanceof Error ? err.message : 'Unsupported compression method.',
        })
      }
    }
    void (async () => {
      try {
        for (let offset = 0; offset < blob.size; offset += EXTRACT_SLICE) {
          const end = Math.min(offset + EXTRACT_SLICE, blob.size)
          unzipper.push(await readSlice(blob, offset, end), end === blob.size)
          onProgress?.(end)
        }
        resolve()
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not read this zip archive.'))
      }
    })()
  })

  for (const name of started) {
    if (!finished.has(name) && !errors.some((entry) => entry.name === name)) {
      errors.push({ name, message: 'The archive ended before this file finished.' })
      parts.delete(name)
    }
  }

  return {
    files: [...parts.entries()].map(([name, chunks]) => ({ name, data: concatBytes(chunks) })),
    errors,
  }
}

/** Build a new archive (streaming, chunked reads) at the given level 0–9. */
export function buildArchive(
  entries: ZipInput[],
  level: number,
  onProgress?: (bytesDone: number) => void,
): Promise<Blob> {
  return streamZip(entries, onProgress, ZIP_CHUNK_SIZE, level)
}
