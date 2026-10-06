import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { Toaster } from './components/Toast'
import { ProgressBar } from './components/ProgressBar'
import ToolboxRoutes from './pages/ToolboxRoutes'

const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })))
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
  const { pathname } = useLocation()
  useEffect(() => {
    const url = `https://nymbx.dev${pathname === '/tools' ? '/' : pathname}`
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url)
  }, [pathname])

  return (
    <>
      <Routes>
        <Route
          path="contact"
          element={
            <ChunkErrorBoundary>
              <Suspense fallback={<PageLoader label="Loading contact information…" />}>
                <Landing />
              </Suspense>
            </ChunkErrorBoundary>
          }
        />
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
          path="*"
          element={
            <ChunkErrorBoundary>
              <ToolboxRoutes />
            </ChunkErrorBoundary>
          }
        />
      </Routes>
      <Toaster />
    </>
  )
}
