import { useState } from 'react'
import { Outlet, Route, Routes } from 'react-router'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Footer } from './components/Footer'
import { Toaster } from './components/Toast'
import { Dashboard } from './pages/Dashboard'
import { ToolPage } from './pages/ToolPage'
import { NotFound } from './pages/NotFound'

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
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="tools/:slug" element={<ToolPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
