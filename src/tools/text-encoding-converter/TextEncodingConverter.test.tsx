import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import TextEncodingConverter from './TextEncodingConverter'

function renderTool() {
  return render(
    <MemoryRouter>
      <TextEncodingConverter />
    </MemoryRouter>,
  )
}

describe('TextEncodingConverter', () => {
  it('starts on the convert tab with a dropzone and no worker', () => {
    const { container } = renderTool()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Convert a file', 'Repair mojibake'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('switches to the mojibake tab and shows both encoding selects', async () => {
    renderTool()
    await userEvent.click(screen.getByRole('tab', { name: 'Repair mojibake' }))

    expect(screen.getByRole('tab', { name: 'Repair mojibake' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Garbled text')).toBeInTheDocument()
    expect(screen.getByLabelText('Was decoded as')).toHaveValue('auto')
    expect(screen.getByLabelText('Actually is')).toHaveValue('auto')
  })

  it('offers ISO-2022-JP only as a target, never as the wrong decoder', async () => {
    renderTool()
    await userEvent.click(screen.getByRole('tab', { name: 'Repair mojibake' }))

    const decodedAs = screen.getByLabelText('Was decoded as')
    const actual = screen.getByLabelText('Actually is')
    expect(decodedAs.textContent).not.toContain('ISO-2022-JP')
    expect(actual.textContent).toContain('ISO-2022-JP')
  })
})
