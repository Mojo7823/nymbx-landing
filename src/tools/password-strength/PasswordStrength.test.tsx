import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { ZxcvbnFactory } from '@zxcvbn-ts/core'
import PasswordStrength from './PasswordStrength'
import { initStrength, isStrengthReady } from './strength'
import type * as StrengthModule from './strength'

vi.mock('./strength', async (importOriginal) => {
  const actual = await importOriginal<typeof StrengthModule>()
  return {
    ...actual,
    initStrength: vi.fn(actual.initStrength),
    isStrengthReady: vi.fn(() => false),
  }
})

function renderTool() {
  return render(
    <MemoryRouter>
      <PasswordStrength />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isStrengthReady).mockReturnValue(false)
})

describe('PasswordStrength startup', () => {
  it('loads on input, gives a genuine score, and clears its analysis immediately', async () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'Load weak sample' }))
    expect(
      await screen.findByRole('img', { name: /^Password strength [01] out of 4:/ }),
    ).toBeInTheDocument()

    // Selecting the current sample must not erase a score without rescheduling it.
    fireEvent.click(screen.getByRole('button', { name: 'Load weak sample' }))
    expect(screen.getByRole('img', { name: /^Password strength/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByRole('img', { name: /^Password strength/ })).not.toBeInTheDocument()
  })

  it('does not restore a pending password or loading state after clear', async () => {
    // The app targets ES2022, which does not declare Promise.withResolvers.
    let rejectLoad!: (error: Error) => void
    vi.mocked(initStrength).mockImplementationOnce(
      () =>
        new Promise<ZxcvbnFactory>((_resolve, reject) => {
          rejectLoad = reject
        }),
    )
    renderTool()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await act(async () => {
      rejectLoad(new Error('offline'))
    })
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
