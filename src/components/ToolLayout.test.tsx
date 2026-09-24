import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToolLayout } from './ToolLayout'

describe('ToolLayout', () => {
  it('renders title, description, badge and back link', () => {
    render(
      <MemoryRouter>
        <ToolLayout title="Diff checker" description="Compare two texts" badge="client-side">
          <p>tool body</p>
        </ToolLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Diff checker')
    expect(screen.getByText('Compare two texts')).toBeInTheDocument()
    expect(screen.getByLabelText('Client-side')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all tools/i })).toHaveAttribute('href', '/')
    expect(screen.getByText('tool body')).toBeInTheDocument()
    expect(document.title).toContain('Diff checker')
  })

  it('shows the amber badge for server-assisted tools', () => {
    render(
      <MemoryRouter>
        <ToolLayout title="DOCX ↔ PDF" description="Via our server" badge="server-assisted">
          <div />
        </ToolLayout>
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Server-assisted')).toBeInTheDocument()
  })
})
