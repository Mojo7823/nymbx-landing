import { Suspense, lazy } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

/** A lazy route whose chunk cannot be fetched — what happens offline. */
const Broken = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))

function renderBroken() {
  return render(
    <MemoryRouter>
      <ChunkErrorBoundary>
        <Suspense fallback={<p>loading</p>}>
          <Broken />
        </Suspense>
      </ChunkErrorBoundary>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChunkErrorBoundary', () => {
  it('renders a retry card instead of a blank screen when a chunk fails', async () => {
    // React logs the caught error; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderBroken()

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByText('This page failed to load.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to all tools/i })).toHaveAttribute(
      'href',
      '/tools',
    )
  })

  it('explains the failure as a missing download while offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderBroken()

    expect(await screen.findByText("This tool hasn't been downloaded yet.")).toBeInTheDocument()
  })

  it('renders its children untouched when nothing throws', () => {
    render(
      <MemoryRouter>
        <ChunkErrorBoundary>
          <p>all good</p>
        </ChunkErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })
})
