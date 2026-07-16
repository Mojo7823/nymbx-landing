import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme)

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:text-ink"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
