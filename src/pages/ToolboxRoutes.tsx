import { useState } from 'react'
import { Outlet, Route, Routes } from 'react-router'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { Footer } from '../components/Footer'
import { Dashboard } from './Dashboard'
import { ToolPage } from './ToolPage'
import { NotFound } from './NotFound'

function Shell() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col">
      <Header onOpenNav={() => setNavOpen(true)} />
      <div className="flex w-full flex-1">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  )
}

/**
 * Everything under /tools. Loaded lazily so the portfolio landing doesn't pull
 * in the tool registry and its icon set.
 */
export default function ToolboxRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path=":slug" element={<ToolPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
