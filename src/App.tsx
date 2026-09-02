import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'
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

export default function App() {
  return (
    <>
      <Routes>
        <Route index element={<Landing />} />
        <Route
          path="itsme"
          element={
            <Suspense fallback={<PageLoader label="Loading the personal page…" />}>
              <ItsMe />
            </Suspense>
          }
        />
        <Route
          path="tools/*"
          element={
            <Suspense fallback={<PageLoader label="Loading the toolbox…" />}>
              <ToolboxRoutes />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  )
}
