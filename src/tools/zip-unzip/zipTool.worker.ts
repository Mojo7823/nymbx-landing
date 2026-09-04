/// <reference lib="webworker" />
import { expose } from 'comlink'
import { buildArchive, extractEntries, listArchive } from './zipTool'

const api = {
  /** Stream `entries` into a compressed archive at `level` (0–9). */
  buildZip(
    entries: Array<{ name: string; blob: Blob }>,
    level: number,
    onProgress?: (bytesDone: number) => void,
  ): Promise<Blob> {
    return buildArchive(entries, level, onProgress)
  },
  /** List entries with sizes/flags without decompressing. */
  listZip(blob: Blob) {
    return listArchive(blob)
  },
  /** Stream-extract `wanted` entries; per-file failures are collected. */
  extractZip(blob: Blob, wanted: string[], onProgress?: (bytesDone: number) => void) {
    return extractEntries(blob, wanted, onProgress)
  },
}

export type ZipToolWorkerApi = typeof api

expose(api)
