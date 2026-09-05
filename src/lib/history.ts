/**
 * Generic undo/redo over immutable snapshots.
 *
 * `present` is the current state; `past` holds the states you can undo back
 * to (oldest first) and `future` the states a redo walks forward into. The
 * state type `T` is whatever a tool edits — an object array, a region list —
 * and is never mutated: every operation returns a new `History<T>`.
 *
 * Extracted from the sign & annotate editor (Phase 52) so other tools can
 * share the exact same semantics.
 */

/** Maximum number of undo steps kept; older steps fall off the front. */
export const HISTORY_LIMIT = 100

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function emptyHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Commit a new state, dropping the redo stack. */
export function commit<T>(history: History<T>, present: T): History<T> {
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT)
  return { past, present, future: [] }
}

/**
 * Replace the present state without recording a step — used to coalesce a
 * burst of edits to the same object (typing in a text box, dragging a
 * handle) into the single step that `commit` recorded when the burst began.
 */
export function amend<T>(history: History<T>, present: T): History<T> {
  return { ...history, present }
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history
  const past = history.past.slice(0, -1)
  const present = history.past[history.past.length - 1]
  return { past, present, future: [history.present, ...history.future].slice(0, HISTORY_LIMIT) }
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history
  const [present, ...future] = history.future
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present, future }
}
