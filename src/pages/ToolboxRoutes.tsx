import { useCallback, useState } from 'react'
import { Outlet, Route, Routes, useNavigate } from 'react-router'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { Footer } from '../components/Footer'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { useGlobalShortcuts } from '../lib/shortcuts'
import { Dashboard } from './Dashboard'
import { ToolPage } from './ToolPage'
import { NotFound } from './NotFound'

function Shell() {
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const navigate = useNavigate()

  const onFocusSearch = useCallback(() => {
    const input = document.getElementById('tool-search')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
      return
    }
    // Not on the dashboard — go there and let it focus the box on mount.
    void navigate('/tools', { state: { focusSearch: true } })
  }, [navigate])

  const onOpenHelp = useCallback(() => setHelpOpen(true), [])

  useGlobalShortcuts({ onFocusSearch, onOpenHelp })

  return (
    <div className="flex min-h-dvh flex-col">
      <Header onOpenNav={() => setNavOpen(true)} onOpenShortcuts={onOpenHelp} />
      <div className="flex w-full flex-1">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <Footer />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
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
