import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Toaster } from './Toast'
import { dismissToast, toast } from '../lib/toast'

afterEach(() => {
  // Drain any toasts left over from a test.
  for (let i = 0; i < 100; i++) dismissToast(i)
})

describe('toast()', () => {
  it('shows a message via the Toaster', () => {
    render(<Toaster />)
    act(() => {
      toast('Saved!', { variant: 'success', duration: 0 })
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved!')
  })

  it('stacks multiple toasts and dismisses individually', () => {
    render(<Toaster />)
    let id = 0
    act(() => {
      id = toast('first', { duration: 0 })
      toast('second', { duration: 0 })
    })
    expect(screen.getAllByRole('status')).toHaveLength(2)
    act(() => {
      dismissToast(id)
    })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('second')
  })

  it('renders an action button that runs its handler and dismisses the toast', () => {
    render(<Toaster />)
    const onClick = vi.fn()
    act(() => {
      toast('A new version is ready.', {
        duration: 0,
        action: { label: 'Reload', onClick },
      })
    })
    const button = screen.getByRole('button', { name: 'Reload' })
    act(() => {
      button.click()
    })
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
