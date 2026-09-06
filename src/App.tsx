import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { Toaster } from './components/Toast'
import { ProgressBar } from './components/ProgressBar'
import { Landing } from './pages/Landing'
import { NotFound } from './pages/NotFound'

const ToolboxRoutes = lazy(() => import('./pages/ToolboxRoutes'))
const ItsMe = lazy(() => import('./pages/ItsMe'))

function PageLoader({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <ProgressBar label={label} />
    </div>
  )
}

/**
 * Registers the service worker after the page has loaded, through a dynamic
 * import: `workbox-window` must stay out of the entry chunk (the dashboard is
 * size-budgeted) and SW registration must not compete with first paint.
 * Production only — `vite dev` serves no service worker.
 */
function useServiceWorker(): void {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const start = () => void import('./pwa/register').then((m) => m.registerPwa())
    if (document.readyState === 'complete') {
      start()
      return
    }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [])
}

export default function App() {
  useServiceWorker()

  return (
    <>
      <Routes>
        <Route index element={<Landing />} />
        <Route
          path="itsme"
          element={
            <ChunkErrorBoundary>
              <Suspense fallback={<PageLoader label="Loading the personal page…" />}>
                <ItsMe />
              </Suspense>
            </ChunkErrorBoundary>
          }
        />
        <Route
          path="tools/*"
          element={
            <ChunkErrorBoundary>
              <Suspense fallback={<PageLoader label="Loading the toolbox…" />}>
                <ToolboxRoutes />
              </Suspense>
            </ChunkErrorBoundary>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  )
}
