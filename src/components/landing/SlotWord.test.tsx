import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { SlotWord } from './SlotWord'

const WORDS = ['Auray Technology', 'NTUST', 'TAICS', 'You?']

/** Reel step = dwell + spin, kept in sync with SlotWord. */
const STEP_MS = 1260

function stripTransform() {
  const strip = document.querySelector('.slot__strip')
  return (strip as HTMLElement).style.transform
}

describe('SlotWord', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders every word and rests on the first one', () => {
    render(<SlotWord words={WORDS} />)
    for (const word of WORDS) expect(screen.getByText(word)).toBeInTheDocument()
    expect(stripTransform()).toBe('translateY(-0%)')
  })

  it('steps through the reel on hover and stops on the last word', () => {
    render(<SlotWord words={WORDS} />)
    const button = screen.getByRole('button')

    act(() => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(stripTransform()).toBe('translateY(-25%)')

    act(() => vi.advanceTimersByTime(STEP_MS))
    expect(stripTransform()).toBe('translateY(-50%)')

    act(() => vi.advanceTimersByTime(STEP_MS))
    expect(stripTransform()).toBe('translateY(-75%)')

    // Parks on "You?" instead of wrapping around.
    act(() => vi.advanceTimersByTime(STEP_MS * 3))
    expect(stripTransform()).toBe('translateY(-75%)')
  })

  it('returns to the first word when the pointer leaves', () => {
    render(<SlotWord words={WORDS} />)
    const button = screen.getByRole('button')

    act(() => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    act(() => vi.advanceTimersByTime(STEP_MS))
    expect(stripTransform()).toBe('translateY(-50%)')

    act(() => {
      button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    expect(stripTransform()).toBe('translateY(-0%)')
  })

  it('exposes the whole reel to assistive tech', () => {
    render(<SlotWord words={WORDS} />)
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Working with Auray Technology, then NTUST, then TAICS, then You?',
    )
  })
})
