import { afterEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createZip, downloadBlob, downloadZip } from './download'

function stubObjectUrls() {
  URL.createObjectURL = vi.fn(() => 'blob:nymbx-test')
  URL.revokeObjectURL = vi.fn()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadBlob', () => {
  it('clicks a temporary anchor pointing at the blob', () => {
    stubObjectUrls()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadBlob(new Blob(['hello']), 'hello.txt')

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('hello.txt')
    expect(anchor.href).toContain('blob:nymbx-test')
    // The temporary anchor must not linger in the document.
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

describe('createZip / downloadZip', () => {
  it('produces a zip whose entries round-trip', async () => {
    const out = await createZip([
      { name: 'a.txt', data: 'alpha' },
      { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) },
    ])

    const entries = unzipSync(out)
    expect(Object.keys(entries).sort()).toEqual(['a.txt', 'dir/b.bin'])
    expect(strFromU8(entries['a.txt']!)).toBe('alpha')
    expect(Array.from(entries['dir/b.bin']!)).toEqual([1, 2, 3])
  })

  it('downloads the archive under the given name', async () => {
    stubObjectUrls()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadZip([{ name: 'x.txt', data: 'x' }], 'bundle.zip')

    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('bundle.zip')
  })
})
