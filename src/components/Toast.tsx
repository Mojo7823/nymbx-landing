import { useSyncExternalStore } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cx } from '../lib/cx'
import { dismissToast, getToasts, subscribeToasts, type ToastVariant } from '../lib/toast'

const icons: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
}

const variantClasses: Record<ToastVariant, string> = {
  info: 'text-ink',
  success: 'text-pine',
  error: 'text-red-600 dark:text-red-400',
}

export function Toaster() {
  const current = useSyncExternalStore(subscribeToasts, getToasts, getToasts)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {current.map(({ id, message, variant }) => {
        const Icon = icons[variant]
        return (
          <div
            key={id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-card p-3 text-sm shadow-lg"
          >
            <Icon className={cx('mt-0.5 size-4 shrink-0', variantClasses[variant])} />
            <p className="min-w-0 flex-1 text-ink break-words">{message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(id)}
              className="cursor-pointer rounded p-0.5 text-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
