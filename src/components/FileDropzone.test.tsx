import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileDropzone } from './FileDropzone'

function makeFile(name: string, size: number, type = 'text/plain'): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('FileDropzone', () => {
  it('accepts files via the hidden input and lists them with sizes', async () => {
    const onFiles = vi.fn()
    const { container } = render(<FileDropzone multiple onFiles={onFiles} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [makeFile('a.txt', 1024), makeFile('b.txt', 2048)])

    expect(onFiles).toHaveBeenCalledOnce()
    expect(onFiles.mock.calls[0]![0]).toHaveLength(2)
    expect(screen.getByText('a.txt')).toBeInTheDocument()
    expect(screen.getByText('1 KB')).toBeInTheDocument()
  })

  it('rejects files over maxSize with a visible error', async () => {
    const onFiles = vi.fn()
    const { container } = render(<FileDropzone maxSize={1024} onFiles={onFiles} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, makeFile('big.bin', 4096, 'application/octet-stream'))

    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('big.bin')
  })

  it('is keyboard reachable as a button', () => {
    render(<FileDropzone onFiles={() => {}} />)
    expect(screen.getByRole('button', { name: /drop a file here/i })).toHaveAttribute(
      'tabindex',
      '0',
    )
  })

  it('accepts dropped files', () => {
    const onFiles = vi.fn()
    render(<FileDropzone onFiles={onFiles} />)
    const zone = screen.getByRole('button', { name: /drop a file here/i })

    const file = makeFile('dropped.txt', 10)
    const dataTransfer = { files: [file], items: [], types: ['Files'] }
    const event = new Event('drop', { bubbles: true }) as Event & { dataTransfer: unknown }
    event.dataTransfer = dataTransfer
    zone.dispatchEvent(event)

    expect(onFiles).toHaveBeenCalledOnce()
  })

  it('reports plain drops through onPaths when folders are enabled', async () => {
    const onPaths = vi.fn()
    render(<FileDropzone multiple folders onFiles={() => {}} onPaths={onPaths} />)
    const zone = screen.getByRole('button', { name: /drop files here/i })

    const file = makeFile('dropped.txt', 10)
    const dataTransfer = { files: [file], items: [], types: ['Files'] }
    const event = new Event('drop', { bubbles: true }) as Event & { dataTransfer: unknown }
    event.dataTransfer = dataTransfer
    zone.dispatchEvent(event)

    await waitFor(() => expect(onPaths).toHaveBeenCalledOnce())
    expect(onPaths.mock.calls[0]![0]).toEqual([{ file, path: 'dropped.txt' }])
  })

  it('traverses dropped folders and reports relative paths', async () => {
    const onPaths = vi.fn()
    render(<FileDropzone multiple folders onFiles={() => {}} onPaths={onPaths} />)
    const zone = screen.getByRole('button', { name: /drop files here/i })

    const inner = new File(['x'], 'a.jpg')
    let served = false
    const dirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'photos',
      createReader: () => ({
        readEntries: (success: (entries: unknown[]) => void) => {
          // Like the real API, the second read comes back empty.
          const batch = served ? [] : [fileEntry]
          served = true
          success(batch)
        },
      }),
    }
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'a.jpg',
      file: (ok: (f: File) => void) => ok(inner),
    }
    const dataTransfer = {
      files: [],
      items: [{ kind: 'file', webkitGetAsEntry: () => dirEntry }],
      types: ['Files'],
    }
    const event = new Event('drop', { bubbles: true }) as Event & { dataTransfer: unknown }
    event.dataTransfer = dataTransfer
    zone.dispatchEvent(event)

    await waitFor(() => expect(onPaths).toHaveBeenCalledOnce())
    expect(onPaths.mock.calls[0]![0]).toEqual([{ file: inner, path: 'photos/a.jpg' }])
  })

  it('offers a folder picker with webkitdirectory only when folders are enabled', () => {
    const plain = render(<FileDropzone onFiles={() => {}} />)
    expect(plain.container.querySelectorAll('input[type="file"]')).toHaveLength(1)
    plain.unmount()

    const { container } = render(<FileDropzone folders onFiles={() => {}} />)
    const inputs = container.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    expect(inputs[1]!.hasAttribute('webkitdirectory')).toBe(true)
    expect(screen.getByRole('button', { name: /choose a whole folder/i })).toBeInTheDocument()
  })

  it('reports refused files through onReject', async () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    const { container } = render(
      <FileDropzone accept="application/pdf" onFiles={onFiles} onReject={onReject} />,
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, makeFile('notes.txt', 10), { applyAccept: false })

    expect(onFiles).not.toHaveBeenCalled()
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]![0].map((f: File) => f.name)).toEqual(['notes.txt'])
  })
})
