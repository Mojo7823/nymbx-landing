import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CloudOff, RotateCw } from 'lucide-react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Catches the failure that offline browsing makes routine: a lazy route chunk
 * that is neither cached nor reachable. React unmounts the whole subtree on a
 * render error, so without this the user gets a blank page with an error only
 * in the console. Wraps the lazy routes in App.tsx and the tool <Suspense> in
 * ToolPage.tsx.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Failed to load a page chunk', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children

    // Read at render time, not in state: the user may have reconnected since.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine

    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
          <CloudOff className="size-8 text-faint" />
          <p className="text-sm font-medium text-ink">
            {offline ? "This tool hasn't been downloaded yet." : 'This page failed to load.'}
          </p>
          <p className="max-w-md text-xs text-muted">
            {offline
              ? 'Connect to the internet and try again. Tools you have already opened keep working offline.'
              : 'The page files could not be fetched. Reloading usually fixes it.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => location.reload()}>
              <RotateCw className="size-3.5" />
              Retry
            </Button>
            <Link
              to="/tools"
              className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted hover:text-pine"
            >
              Back to all tools
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
