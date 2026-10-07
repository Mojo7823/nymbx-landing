/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import { fillForm, inspectForm } from './form'
import type { FillRequest, FormSummary } from './types'

let original: Uint8Array | null = null
let cachedFont: Uint8Array | undefined

const api = {
  async open(buffer: ArrayBuffer): Promise<FormSummary> {
    original = null
    cachedFont = undefined
    const bytes = new Uint8Array(buffer)
    const summary = await inspectForm(bytes)
    original = bytes
    return summary
  },

  async apply(request: FillRequest): Promise<Uint8Array> {
    if (!original) throw new Error('No PDF is loaded. Open a PDF form first.')
    if (request.fontBytes) cachedFont = request.fontBytes
    const bytes = await fillForm(original, {
      ...request,
      fontBytes: request.fontBytes ?? cachedFont,
    })
    return transfer(bytes, [bytes.buffer])
  },

  close(): void {
    original = null
    cachedFont = undefined
  },
}

export type FormWorkerApi = typeof api

expose(api)
