import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONVERT_ENDPOINT,
  ConvertError,
  convertToPdf,
  errorMessage,
  MAX_FILE_BYTES,
  pdfName,
} from './convert'

describe('pdfName', () => {
  it('replaces .docx and .doc extensions case-insensitively', () => {
    expect(pdfName('Report.docx')).toBe('Report.pdf')
    expect(pdfName('legacy.DOC')).toBe('legacy.pdf')
    expect(pdfName('Q3 report.final.DocX')).toBe('Q3 report.final.pdf')
  })

  it('appends .pdf to unexpected names and never returns ".pdf" alone', () => {
    expect(pdfName('notes.txt')).toBe('notes.txt.pdf')
    expect(pdfName('README')).toBe('README.pdf')
    expect(pdfName('.docx')).toBe('converted.pdf')
  })
})

describe('errorMessage', () => {
  it('explains the size limit on 413', () => {
    expect(errorMessage(413)).toMatch(/too large/i)
  })

  it('treats network errors and bad gateways as service-unreachable', () => {
    for (const status of [0, 502, 503, 504]) {
      expect(errorMessage(status)).toMatch(/unreachable/i)
    }
  })

  it('blames the document on other 4xx and the server on 5xx', () => {
    expect(errorMessage(400)).toMatch(/could not convert/i)
    expect(errorMessage(500)).toMatch(/failed on the server/i)
  })
})

describe('convertToPdf', () => {
  class FakeXhr {
    static instances: FakeXhr[] = []
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    response: unknown = null
    responseType = ''
    timeout = 0
    opened: [string, string] | null = null
    sent: FormData | null = null
    open(method: string, url: string) {
      this.opened = [method, url]
    }
    send(body: FormData) {
      this.sent = body
    }
    abort() {
      this.onabort?.()
    }
    constructor() {
      FakeXhr.instances.push(this)
    }
  }

  afterEach(() => {
    FakeXhr.instances = []
    vi.unstubAllGlobals()
  })

  function start() {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const file = new File(['fake'], 'doc.docx')
    const onProgress = vi.fn()
    const handle = convertToPdf(file, onProgress)
    return { handle, xhr: FakeXhr.instances[0], onProgress }
  }

  it('POSTs multipart form data to the proxy endpoint and resolves with the blob', async () => {
    const { handle, xhr } = start()
    expect(xhr.opened).toEqual(['POST', CONVERT_ENDPOINT])
    expect(xhr.sent?.get('files')).toBeInstanceOf(File)
    xhr.status = 200
    xhr.response = new Blob(['%PDF-'])
    xhr.onload?.()
    await expect(handle.result).resolves.toBeInstanceOf(Blob)
  })

  it('rejects with a ConvertError carrying the mapped message on HTTP errors', async () => {
    const { handle, xhr } = start()
    xhr.status = 413
    xhr.onload?.()
    await expect(handle.result).rejects.toThrow(ConvertError)
    await expect(handle.result).rejects.toThrow(/too large/i)
  })

  it('rejects as unreachable on network error', async () => {
    const { handle, xhr } = start()
    xhr.onerror?.()
    await expect(handle.result).rejects.toThrow(/unreachable/i)
  })

  it('rejects with "cancelled" when aborted via the handle', async () => {
    const { handle } = start()
    handle.cancel()
    await expect(handle.result).rejects.toThrow('cancelled')
  })

  it('reports upload progress as a percentage', () => {
    const { xhr, onProgress } = start()
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 } as ProgressEvent)
    expect(onProgress).toHaveBeenCalledWith(25)
  })
})

it('client cap stays under the 30 MB Caddy request_body limit', () => {
  expect(MAX_FILE_BYTES).toBeLessThan(30 * 1024 * 1024)
})
