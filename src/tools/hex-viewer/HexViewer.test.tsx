import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import HexViewer from './HexViewer'

vi.mock('./detect', () => ({
  detectFile: vi.fn().mockResolvedValue({ ext: 'png', mime: 'image/png' }),
}))

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('HexViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  it('flags a renamed file and copies the selected bytes as hex', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const content = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const file = new File([content], 'renamed.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'slice', {
      value: (start = 0, end = content.length) => ({
        arrayBuffer: async () => content.slice(start, end).buffer,
      }),
    })

    const { container } = render(
      <MemoryRouter>
        <HexViewer />
      </MemoryRouter>,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Named .txt, but bytes indicate .png',
    )
    const cells = await screen.findAllByRole('gridcell')
    fireEvent.click(cells[0]!)
    fireEvent.click(cells[2]!, { shiftKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Copy 3 bytes' }))

    expect(writeText).toHaveBeenCalledWith('89 50 4E')
  })
})
