import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /choose a file/i })).toHaveAttribute('tabindex', '0')
  })

  it('accepts dropped files', () => {
    const onFiles = vi.fn()
    render(<FileDropzone onFiles={onFiles} />)
    const zone = screen.getByRole('button', { name: /choose a file/i })

    const file = makeFile('dropped.txt', 10)
    const dataTransfer = { files: [file], items: [], types: ['Files'] }
    const event = new Event('drop', { bubbles: true }) as Event & { dataTransfer: unknown }
    event.dataTransfer = dataTransfer
    zone.dispatchEvent(event)

    expect(onFiles).toHaveBeenCalledOnce()
  })
})
