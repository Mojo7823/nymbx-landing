export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const DEFAULT_DURATION = 4000

let nextId = 1
let items: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): ToastItem[] {
  return items
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Imperative toast — call from anywhere; rendered by the <Toaster /> in the app shell. */
export function toast(
  message: string,
  opts?: { variant?: ToastVariant; duration?: number },
): number {
  const item: ToastItem = { id: nextId++, message, variant: opts?.variant ?? 'info' }
  items = [...items, item]
  emit()
  const duration = opts?.duration ?? DEFAULT_DURATION
  if (duration > 0) setTimeout(() => dismissToast(item.id), duration)
  return item.id
}
