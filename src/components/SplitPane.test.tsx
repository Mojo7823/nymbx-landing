import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SplitPane } from './SplitPane'

let media: EventTarget & { matches: boolean }

beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: true })
  vi.stubGlobal('matchMedia', () => media)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderPanes() {
  render(
    <SplitPane
      first={<textarea aria-label="Source" defaultValue="Original source" />}
      second={<textarea aria-label="Result" defaultValue="Original result" />}
    />,
  )
  const separator = screen.getByRole('separator')
  const source = screen.getByRole('textbox', { name: 'Source' })
  const result = screen.getByRole('textbox', { name: 'Result' })
  fireEvent.change(source, { target: { value: 'Unsaved source draft' } })
  fireEvent.change(result, { target: { value: 'Unsaved result draft' } })
  return { separator, source, result }
}

function setUpDrag(separator: HTMLElement) {
  vi.spyOn(separator.parentElement!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 0, 1024, 400),
  )
  const handleRect = vi
    .spyOn(separator, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(600, 0, 24, 400))
  let capturedPointer: number | undefined
  Object.assign(separator, {
    setPointerCapture: (pointerId: number) => {
      capturedPointer = pointerId
    },
    hasPointerCapture: (pointerId: number) => capturedPointer === pointerId,
    releasePointerCapture: () => {
      capturedPointer = undefined
    },
  })
  return handleRect
}

describe('SplitPane', () => {
  it('collapses either pane with arrow keys and restores its existing draft', () => {
    const { separator, source, result } = renderPanes()
    separator.focus()

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '45')
    for (let i = 0; i < 12; i++) fireEvent.keyDown(separator, { key: 'ArrowLeft' })

    expect(separator).toHaveAttribute('aria-valuenow', '0')
    expect(separator).toHaveAttribute('aria-valuemin', '0')
    expect(screen.queryByRole('textbox', { name: 'Source' })).not.toBeInTheDocument()
    expect(source.parentElement).toHaveAttribute('inert')
    expect(source).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Result' })).toBe(result)
    expect(separator).toHaveFocus()

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '5')
    expect(screen.getByRole('textbox', { name: 'Source' })).toBe(source)
    expect(source.parentElement).not.toHaveAttribute('inert')
    expect(source).toHaveValue('Unsaved source draft')

    for (let i = 0; i < 22; i++) fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '100')
    expect(separator).toHaveAttribute('aria-valuemax', '100')
    expect(screen.queryByRole('textbox', { name: 'Result' })).not.toBeInTheDocument()
    expect(result.parentElement).toHaveAttribute('inert')
    expect(result).toBeInTheDocument()

    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('textbox', { name: 'Result' })).toBe(result)
    expect(result.parentElement).not.toHaveAttribute('inert')
    expect(result).toHaveValue('Unsaved result draft')
    expect(source).toHaveValue('Unsaved source draft')
  })

  it('drags to both edges without a grab jump and preserves existing drafts', () => {
    const { separator, source, result } = renderPanes()
    const handleRect = setUpDrag(separator)
    const pointer = { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }

    // The available pane width is 1000px, and the grab is 3px into the 24px handle.
    fireEvent.pointerDown(separator, { ...pointer, clientX: 603 })
    fireEvent.pointerMove(separator, { ...pointer, clientX: 603 })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
    expect(separator).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByRole('textbox', { name: 'Source' })).not.toBeInTheDocument()
    fireEvent.pointerUp(separator, pointer)

    // Re-grab at a different point of the still-reachable handle to reopen.
    handleRect.mockReturnValue(new DOMRect(100, 0, 24, 400))
    fireEvent.pointerDown(separator, { ...pointer, clientX: 120 })
    fireEvent.pointerMove(separator, { ...pointer, clientX: 620 })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('textbox', { name: 'Source' })).toBe(source)
    expect(source).toHaveValue('Unsaved source draft')
    fireEvent.pointerMove(separator, { ...pointer, clientX: 1120 })
    expect(separator).toHaveAttribute('aria-valuenow', '100')
    expect(screen.queryByRole('textbox', { name: 'Result' })).not.toBeInTheDocument()
    fireEvent.pointerUp(separator, pointer)

    handleRect.mockReturnValue(new DOMRect(1100, 0, 24, 400))
    fireEvent.pointerDown(separator, { ...pointer, clientX: 1105 })
    fireEvent.pointerMove(separator, { ...pointer, clientX: 605 })
    fireEvent.pointerUp(separator, pointer)
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('textbox', { name: 'Result' })).toBe(result)
    expect(result).toHaveValue('Unsaved result draft')
  })

  it.each(['pointerCancel', 'lostPointerCapture', 'pointerUp'] as const)(
    'ends resizing on %s and allows a new drag',
    (endEvent) => {
      const { separator } = renderPanes()
      setUpDrag(separator)
      const pointer = { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }
      fireEvent.pointerDown(separator, { ...pointer, clientX: 603 })
      fireEvent[endEvent](separator, pointer)
      fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
      expect(separator).toHaveAttribute('aria-valuenow', '50')

      fireEvent.pointerDown(separator, { ...pointer, clientX: 603 })
      fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
      expect(separator).toHaveAttribute('aria-valuenow', '0')
      fireEvent.pointerUp(separator, pointer)
      fireEvent.doubleClick(separator)
      expect(separator).toHaveAttribute('aria-valuenow', '50')
      expect(screen.getAllByRole('textbox')).toHaveLength(2)
    },
  )

  it('ignores non-primary pointers and non-left mouse buttons during resizing', () => {
    const { separator } = renderPanes()
    setUpDrag(separator)
    const pointer = { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }
    fireEvent.pointerDown(separator, { ...pointer, button: 2, clientX: 603 })
    fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    fireEvent.pointerDown(separator, { ...pointer, isPrimary: false, clientX: 603 })
    fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
    expect(separator).toHaveAttribute('aria-valuenow', '50')

    fireEvent.pointerDown(separator, { ...pointer, clientX: 603 })
    fireEvent.pointerDown(separator, { ...pointer, pointerId: 2, clientX: 600 })
    fireEvent.pointerMove(separator, { ...pointer, pointerId: 2, clientX: 1103 })
    fireEvent.pointerCancel(separator, { ...pointer, pointerId: 2 })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    fireEvent.pointerMove(separator, { ...pointer, clientX: 103 })
    expect(separator).toHaveAttribute('aria-valuenow', '0')
  })

  it.each(['ArrowLeft', 'ArrowRight'])('restores both panes on mobile after %s collapse', (key) => {
    const { separator, source, result } = renderPanes()
    for (let i = 0; i < 10; i++) fireEvent.keyDown(separator, { key })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)

    act(() => {
      media.matches = false
      media.dispatchEvent(new Event('change'))
    })
    expect(screen.getByRole('textbox', { name: 'Source' })).toBe(source)
    expect(screen.getByRole('textbox', { name: 'Result' })).toBe(result)
    expect(source.parentElement).not.toHaveAttribute('inert')
    expect(result.parentElement).not.toHaveAttribute('inert')
    source.focus()
    expect(source).toHaveFocus()
    fireEvent.change(source, { target: { value: 'Mobile source edit' } })
    result.focus()
    expect(result).toHaveFocus()
    fireEvent.change(result, { target: { value: 'Mobile result edit' } })

    act(() => {
      media.matches = true
      media.dispatchEvent(new Event('change'))
    })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.keyDown(separator, { key: 'Home' })
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(source).toHaveValue('Mobile source edit')
    expect(result).toHaveValue('Mobile result edit')
  })
})
