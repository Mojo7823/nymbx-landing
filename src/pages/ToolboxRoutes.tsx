import { useCallback, useEffect, useState } from 'react'
import { Outlet, Route, Routes, useNavigate } from 'react-router'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { Footer } from '../components/Footer'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { useGlobalShortcuts } from '../lib/shortcuts'
import { Dashboard } from './Dashboard'
import { ToolPage } from './ToolPage'
import { NotFound } from './NotFound'

const SIDEBAR_STORAGE_KEY = 'nymbx:sidebar-collapsed'

function Shell() {
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const navigate = useNavigate()

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed))
    } catch {
      /* Storage unavailable — keep the preference for this session. */
    }
  }, [sidebarCollapsed])

  const onCloseNav = useCallback(() => setNavOpen(false), [])

  const onFocusSearch = useCallback(() => {
    const input = document.getElementById('tool-search')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
      return
    }
    // Not on the dashboard — go there and let it focus the box on mount.
    void navigate('/', { state: { focusSearch: true } })
  }, [navigate])

  const onOpenHelp = useCallback(() => setHelpOpen(true), [])

  useGlobalShortcuts({ onFocusSearch, onOpenHelp })

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        onOpenNav={() => setNavOpen(true)}
        onOpenShortcuts={onOpenHelp}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <div className="flex w-full flex-1">
        <Sidebar open={navOpen} onClose={onCloseNav} collapsed={sidebarCollapsed} />
        <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <Footer />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

/** The tools catalog and lazy-loaded tools share one navigation shell. */
export default function ToolboxRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="tools" element={<Dashboard />} />
        <Route path="tools/:slug" element={<ToolPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
