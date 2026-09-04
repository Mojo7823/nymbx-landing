import { describe, expect, it } from 'vitest'
import { collectDroppedPaths, inputFilePath } from './dropFiles'

function fileEntry(name: string, file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (success: (f: File) => void) => success(file),
  } as unknown as FileSystemFileEntry
}

function dirEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  let served = false
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        // Like the real API, serve in batches — forces the drain loop.
        const batch = served ? [] : children
        served = true
        success(batch)
      },
    }),
  } as unknown as FileSystemDirectoryEntry
}

function transfer(entries: FileSystemEntry[]): DataTransfer {
  const items = entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry }))
  return { items } as unknown as DataTransfer
}

describe('collectDroppedPaths', () => {
  it('returns null for plain-file drops so callers keep the files fast path', async () => {
    const dt = transfer([fileEntry('a.txt', new File(['a'], 'a.txt'))])
    await expect(collectDroppedPaths(dt)).resolves.toBeNull()
  })

  it('returns null when the entry API is unavailable', async () => {
    const dt = { items: [{ kind: 'file' }] } as unknown as DataTransfer
    await expect(collectDroppedPaths(dt)).resolves.toBeNull()
  })

  it('preserves nested folder structure in reported paths', async () => {
    const dt = transfer([
      dirEntry('photos', [
        fileEntry('a.jpg', new File(['a'], 'a.jpg')),
        dirEntry('raw', [fileEntry('b.cr2', new File(['b'], 'b.cr2'))]),
      ]),
      fileEntry('loose.txt', new File(['c'], 'loose.txt')),
    ])
    const paths = await collectDroppedPaths(dt)
    expect(paths?.map((p) => p.path).sort()).toEqual([
      'loose.txt',
      'photos/a.jpg',
      'photos/raw/b.cr2',
    ])
    expect(paths?.map((p) => p.file.name).sort()).toEqual(['a.jpg', 'b.cr2', 'loose.txt'])
  })

  it('skips non-file drag items such as text', async () => {
    const dt = {
      items: [
        { kind: 'string', webkitGetAsEntry: () => null },
        { kind: 'file', webkitGetAsEntry: () => dirEntry('d', []) },
      ],
    } as unknown as DataTransfer
    await expect(collectDroppedPaths(dt)).resolves.toEqual([])
  })

  it('propagates entry read failures instead of silently dropping files', async () => {
    const bad = {
      isFile: true,
      isDirectory: false,
      name: 'bad.txt',
      file: (_ok: unknown, err: (e: Error) => void) => err(new Error('denied')),
    } as unknown as FileSystemFileEntry
    const dt = transfer([dirEntry('d', [bad])])
    await expect(collectDroppedPaths(dt)).rejects.toThrow('denied')
  })
})

describe('inputFilePath', () => {
  it('prefers webkitRelativePath and falls back to the file name', () => {
    const withRel = new File(['x'], 'a.txt') as File & { webkitRelativePath?: string }
    Object.defineProperty(withRel, 'webkitRelativePath', { value: 'dir/a.txt' })
    expect(inputFilePath(withRel)).toBe('dir/a.txt')
    expect(inputFilePath(new File(['x'], 'plain.txt'))).toBe('plain.txt')
  })
})
