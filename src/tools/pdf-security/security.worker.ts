/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import createQpdf from 'qpdf-wasm'
import qpdfScriptUrl from 'qpdf-wasm/qpdf.js?url'
import qpdfWasmUrl from 'qpdf-wasm/qpdf.wasm?url'
import {
  SecurityError,
  securityWarnings,
  validatePdfInput,
  validateSecurityOptions,
} from './security'
import type { QpdfModule } from 'qpdf-wasm'
import type { SecurityOptions, SecurityResult } from './types'

let used = false

const api = {
  async process(file: File, options: SecurityOptions): Promise<SecurityResult> {
    if (used) throw new SecurityError('PdfSecurityEngineFailure')
    used = true
    validateSecurityOptions(options)
    await validatePdfInput(file)
    if (
      !globalThis.crossOriginIsolated ||
      typeof SharedArrayBuffer === 'undefined' ||
      typeof globalThis.crypto?.getRandomValues !== 'function'
    ) {
      throw new SecurityError('PdfSecurityUnavailable')
    }

    const NativeWorker = globalThis.Worker
    const concurrency = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency')
    const children: Worker[] = []
    let failStartup: (error: SecurityError) => void
    const startupFailure = new Promise<never>((_, reject) => {
      failStartup = reject
    })
    const fail = (): void => {
      failStartup(new SecurityError('PdfSecurityUnavailable'))
    }
    const startupTimeout = setTimeout(() => {
      failStartup(new SecurityError('PdfSecurityUnavailable'))
    }, 30_000)
    const originalLog = console.log
    const originalError = console.error

    // qpdf-wasm 0.1.0 hardcodes its pthread pool and console sinks, with no
    // print/printErr or pool-size hooks. These overrides are confined to this
    // disposable dedicated worker; the CLI is synchronous and needs one thread.
    // Track our children because noExitRuntime also prevents native pool cleanup.
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 1 })
      globalThis.Worker = class extends NativeWorker {
        constructor(url: string | URL, workerOptions?: WorkerOptions) {
          super(url, workerOptions)
          children.push(this)
          this.addEventListener('error', fail)
          this.addEventListener('messageerror', fail)
        }
      }
      console.log = () => undefined
      console.error = () => undefined
      self.addEventListener('error', fail)
      self.addEventListener('unhandledrejection', fail)

      // Fixed-size private capture: never log or return native diagnostics, which
      // can contain strings from the PDF. FS.init bypasses the compiled sinks.
      const diagnosticBytes = new Uint8Array(8192)
      let diagnosticLength = 0
      const capture = (byte: number): void => {
        if (diagnosticLength < diagnosticBytes.length) {
          diagnosticBytes[diagnosticLength++] = byte
        }
      }
      const engine = await Promise.race([
        Promise.resolve().then(() =>
          createQpdf({
            noInitialRun: true,
            noFSInit: true,
            locateFile: (name) => {
              if (name === 'qpdf.js') return qpdfScriptUrl
              if (name === 'qpdf.wasm') return qpdfWasmUrl
              throw new SecurityError('PdfSecurityUnavailable')
            },
            preRun: (module) => module.FS.init(() => null, capture, capture),
          }),
        ),
        startupFailure,
      ])
      clearTimeout(startupTimeout)

      engine.FS.mkdir('/input')
      // WORKERFS reads slices of the immutable Blob on demand, without copying
      // the entire input into MEMFS or using the user's filename as a path.
      engine.FS.mount(engine.WORKERFS, { blobs: [{ name: 'source.pdf', data: file }] }, '/input')
      const job = {
        inputFile: '/input/source.pdf',
        outputFile: '/output.pdf',
        password: options.inputPassword,
        // New passwords are UTF-8. QPDF's separate known-input encoding recovery
        // remains enabled; it re-encodes supplied text, not guessed passwords.
        passwordMode: 'unicode',
        streamData: 'preserve',
        ...(options.mode === 'unlock'
          ? { decrypt: '' }
          : {
              encrypt: {
                userPassword: options.userPassword,
                ownerPassword: options.ownerPassword,
                '256bit': {
                  print: options.permissions.print,
                  modify: options.permissions.modify,
                  extract: options.permissions.extract ? 'y' : 'n',
                },
              },
            }),
      }
      // Job JSON, not argv/@files, preserves quotes, whitespace and linebreaks.
      engine.FS.writeFile('/job.json', JSON.stringify(job))
      const exitCode = runJob(engine)
      const warnings = securityWarnings(
        exitCode,
        new TextDecoder().decode(diagnosticBytes.subarray(0, diagnosticLength)),
      )
      // readFile already returns owned ArrayBuffer bytes, not a WASM heap view.
      const bytes = engine.FS.readFile('/output.pdf')
      if (!bytes.byteLength) throw new SecurityError('PdfSecurityEngineFailure')
      return transfer({ bytes, warnings }, [bytes.buffer])
    } catch (error) {
      if (error instanceof SecurityError) throw error
      // Neither native exceptions nor their causes cross the worker boundary.
      throw new SecurityError('PdfSecurityEngineFailure')
    } finally {
      clearTimeout(startupTimeout)
      for (const child of children) child.terminate()
      globalThis.Worker = NativeWorker
      if (concurrency) Object.defineProperty(navigator, 'hardwareConcurrency', concurrency)
      else Reflect.deleteProperty(navigator, 'hardwareConcurrency')
      console.log = originalLog
      console.error = originalError
      self.removeEventListener('error', fail)
      self.removeEventListener('unhandledrejection', fail)
    }
  },
}

function runJob(engine: QpdfModule): number {
  try {
    const status = engine.callMain(['--job-json-file=/job.json'])
    if (typeof status !== 'number') throw new SecurityError('PdfSecurityEngineFailure')
    return status
  } catch (error) {
    // Emscripten normally catches ExitStatus itself. Accept its explicit status
    // if an exit escapes, rather than letting an exit strand the Comlink call.
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'ExitStatus' &&
      'status' in error &&
      typeof error.status === 'number'
    ) {
      return error.status
    }
    throw error
  }
}

export type SecurityWorkerApi = typeof api

expose(api)
