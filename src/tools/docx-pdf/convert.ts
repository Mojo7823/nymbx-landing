/**
 * Client for the server-assisted DOCX → PDF conversion.
 *
 * Uploads go to /api/convert/forms/libreoffice/convert; Caddy strips the
 * /api/convert prefix and forwards to the private Gotenberg service
 * (see deploy/Caddyfile). This is the only place in the app where user file
 * bytes may leave the device — the tool page labels this prominently.
 */

/** Client-side cap; Caddy enforces 30 MB on the proxy as the hard limit. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export const CONVERT_ENDPOINT = '/api/convert/forms/libreoffice/convert'

const TIMEOUT_MS = 120_000

export class ConvertError extends Error {}

/** `Report.docx` → `Report.pdf` (also handles `.doc` and extensionless names). */
export function pdfName(inputName: string): string {
  const base = inputName.replace(/\.docx?$/i, '')
  return `${base || 'converted'}.pdf`
}

/** Map a failed upload to a user-facing message. `status` 0 = network error. */
export function errorMessage(status: number): string {
  if (status === 413) {
    return 'The server rejected this file as too large. The upload limit is 30 MB.'
  }
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return 'The conversion service is unreachable right now. Your file was not converted. Please try again in a minute.'
  }
  if (status >= 400 && status < 500) {
    return 'The server could not convert this file. It may be corrupted, password-protected, or not a real Word document.'
  }
  return 'Conversion failed on the server. Please try again.'
}

export interface ConvertHandle {
  /** Resolves with the converted PDF, rejects with ConvertError. */
  result: Promise<Blob>
  /** Aborts the upload/conversion; `result` rejects with ConvertError('cancelled'). */
  cancel: () => void
}

export function convertToPdf(
  file: File,
  onUploadProgress: (percent: number) => void,
): ConvertHandle {
  const xhr = new XMLHttpRequest()

  const result = new Promise<Blob>((resolve, reject) => {
    xhr.open('POST', CONVERT_ENDPOINT)
    xhr.responseType = 'blob'
    xhr.timeout = TIMEOUT_MS

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Blob)
      } else {
        reject(new ConvertError(errorMessage(xhr.status)))
      }
    }
    xhr.onerror = () => reject(new ConvertError(errorMessage(0)))
    xhr.ontimeout = () =>
      reject(
        new ConvertError('The conversion timed out. Please try again with a smaller document.'),
      )
    xhr.onabort = () => reject(new ConvertError('cancelled'))

    const form = new FormData()
    form.append('files', file, file.name)
    xhr.send(form)
  })

  return { result, cancel: () => xhr.abort() }
}
