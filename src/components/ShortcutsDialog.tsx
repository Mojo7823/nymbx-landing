import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { isApplePlatform, shortcutList } from '../lib/shortcuts'

/**
 * Native <dialog> so Esc, the backdrop and focus trapping come for free.
 * Mounted once in the toolbox Shell; the header button and `?` both open it.
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const mac = isApplePlatform()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (e.target === ref.current) onClose()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-ink shadow-lg backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="shortcuts-title" className="font-display text-sm font-semibold text-ink">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-mint hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <table className="w-full text-left text-sm">
        <tbody>
          {shortcutList(mac).map((shortcut) => (
            <tr
              key={shortcut.keys.join('+') + shortcut.description}
              className="border-b border-line last:border-0"
            >
              <td className="w-32 px-5 py-2.5 align-middle whitespace-nowrap">
                {shortcut.keys.map((k) => (
                  <kbd
                    key={k}
                    className="mr-1 inline-flex min-w-6 justify-center rounded border border-line-strong bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted"
                  >
                    {k}
                  </kbd>
                ))}
              </td>
              <td className="px-5 py-2.5 text-xs text-muted">{shortcut.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  )
}
