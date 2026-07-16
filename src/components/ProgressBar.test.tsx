import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('exposes determinate progress via ARIA', () => {
    render(<ProgressBar value={42} label="Uploading" />)
    const bar = screen.getByRole('progressbar', { name: 'Uploading' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('clamps out-of-range values', () => {
    render(<ProgressBar value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('renders indeterminate without aria-valuenow', () => {
    render(<ProgressBar label="Working" />)
    const bar = screen.getByRole('progressbar', { name: 'Working' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
  })
})
