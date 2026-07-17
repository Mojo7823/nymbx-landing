/** Pure state operations for the page organizer grid. */

export type Rotation = 0 | 90 | 180 | 270

export interface PageState {
  /** Stable identity: 0-based page index in the source document. */
  srcIndex: number
  /** Extra rotation applied on top of the page's own /Rotate, clockwise. */
  rotation: Rotation
}

export function initialPages(pageCount: number): PageState[] {
  return Array.from({ length: pageCount }, (_, srcIndex) => ({ srcIndex, rotation: 0 }))
}

export function addRotation(rotation: Rotation, delta: number): Rotation {
  return ((((rotation + delta) % 360) + 360) % 360) as Rotation
}

/** Rotate the pages whose srcIndex is in `targets` by `delta` degrees clockwise. */
export function rotatePages(
  pages: readonly PageState[],
  targets: ReadonlySet<number>,
  delta: number,
): PageState[] {
  return pages.map((p) =>
    targets.has(p.srcIndex) ? { ...p, rotation: addRotation(p.rotation, delta) } : p,
  )
}

/**
 * Remove the pages whose srcIndex is in `targets`.
 * Returns null when the delete would leave the document empty — the caller
 * must block that instead of producing a zero-page PDF.
 */
export function deletePages(
  pages: readonly PageState[],
  targets: ReadonlySet<number>,
): PageState[] | null {
  const next = pages.filter((p) => !targets.has(p.srcIndex))
  return next.length === 0 ? null : next
}
