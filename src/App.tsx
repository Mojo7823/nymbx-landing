import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'
import { Toaster } from './components/Toast'
import { ProgressBar } from './components/ProgressBar'
import { Landing } from './pages/Landing'
import { NotFound } from './pages/NotFound'

const ToolboxRoutes = lazy(() => import('./pages/ToolboxRoutes'))

export default function App() {
  return (
    <>
      <Routes>
        <Route index element={<Landing />} />
        <Route
          path="tools/*"
          element={
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-4xl px-6 py-16">
                  <ProgressBar label="Loading the toolbox…" />
                </div>
              }
            >
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
