import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SplitPane } from './SplitPane'

describe('SplitPane', () => {
  it('renders both panes and a labeled separator', () => {
    render(<SplitPane first={<p>left pane</p>} second={<p>right pane</p>} label="Resize panes" />)
    expect(screen.getByText('left pane')).toBeInTheDocument()
    expect(screen.getByText('right pane')).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize panes' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
  })

  it('resizes with arrow keys and resets with Home, clamped to min', () => {
    render(<SplitPane first={<p>a</p>} second={<p>b</p>} min={0.4} />)
    const separator = screen.getByRole('separator')

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '45')

    // clamps at min
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '40')

    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator).toHaveAttribute('aria-valuenow', '50')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '60')
  })
})
