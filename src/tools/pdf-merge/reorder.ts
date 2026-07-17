/** Return a copy of `arr` with the element at `from` moved to `to`. */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
