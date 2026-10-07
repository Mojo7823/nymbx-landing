import { useCallback, useEffect, useState } from 'react'
import { Outlet, Route, Routes, useMatch, useNavigate } from 'react-router'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { useGlobalShortcuts } from '../lib/shortcuts'
import { getTool } from '../tools/registry'
import { Dashboard } from './Dashboard'
import { ToolPage } from './ToolPage'
import { NotFound } from './NotFound'

const SIDEBAR_STORAGE_KEY = 'nymbx:sidebar-collapsed'

function Shell() {
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [focusSlug, setFocusSlug] = useState<string | null>(null)
  const match = useMatch('/tools/:slug')
  const activeTool = getTool(match?.params.slug ?? '')
  const focused = Boolean(activeTool && focusSlug === activeTool.slug)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const navigate = useNavigate()

  useEffect(() => {
    if (!activeTool) return
    const previous = document.title
    document.title = `${activeTool.name} · NYMBX Toolbox`
    return () => {
      document.title = previous
    }
  }, [activeTool])

  useEffect(() => {
    if (!focused) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        setFocusSlug(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focused])

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
    void navigate('/tools', { state: { focusSearch: true } })
  }, [navigate])

  const onOpenHelp = useCallback(() => setHelpOpen(true), [])

  useGlobalShortcuts({ onFocusSearch, onOpenHelp })

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        onOpenNav={() => setNavOpen(true)}
        onOpenShortcuts={onOpenHelp}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        activeTool={activeTool}
        focused={focused}
        onToggleFocus={() => {
          setNavOpen(false)
          setFocusSlug(focused ? null : (activeTool?.slug ?? null))
        }}
      />
      <div className="flex min-h-0 w-full flex-1">
        {!focused && <Sidebar open={navOpen} onClose={onCloseNav} collapsed={sidebarCollapsed} />}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <Outlet />
        </main>
      </div>
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
