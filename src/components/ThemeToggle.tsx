import { Moon, Sun } from 'lucide-react'
import { toggleTheme, useTheme } from '../lib/theme'

export function ThemeToggle() {
  const theme = useTheme()

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      data-theme-toggle
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:text-ink"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
