import { useEffect, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { cx } from '../../lib/cx'
import { LANG_OPTIONS, type Lang } from './i18n'

/** Short label shown in the header button. */
const shortLabel: Record<Lang, string> = {
  en: 'EN',
  id: 'ID',
  zh: '中文',
}

export function LanguageSelector({
  lang,
  onChange,
}: {
  lang: Lang
  onChange: (lang: Lang) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape, only while open.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-brand sm:px-3"
      >
        <Globe className="size-4" />
        {shortLabel[lang]}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Language"
          className="absolute right-0 z-50 mt-2 w-44 rounded-lg border border-line bg-card p-1 shadow-[0_18px_40px_-24px_var(--c-brand-ink)]"
        >
          {LANG_OPTIONS.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                role="option"
                aria-selected={option.code === lang}
                onClick={() => {
                  onChange(option.code)
                  setOpen(false)
                }}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                  option.code === lang
                    ? 'font-medium text-brand'
                    : 'text-muted hover:bg-soft hover:text-ink',
                )}
              >
                {option.label}
                {option.code === lang && <Check className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
