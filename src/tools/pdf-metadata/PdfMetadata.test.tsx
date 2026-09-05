import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import PdfMetadata from './PdfMetadata'

describe('PdfMetadata', () => {
  it('renders the empty state with a PDF dropzone and no worker', () => {
    const { container } = render(
      <MemoryRouter>
        <PdfMetadata />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'PDF metadata sanitizer' })).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf')
    expect(screen.getByText('PDF up to 256 MB')).toBeInTheDocument()
    // Nothing is loaded yet, so no editing controls are on the page.
    expect(screen.queryByText('Info dictionary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Strip all metadata/ })).not.toBeInTheDocument()
  })
})
