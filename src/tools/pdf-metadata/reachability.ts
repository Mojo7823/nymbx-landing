import { PDFArray, PDFDict, PDFRef, PDFStream, type PDFContext } from 'pdf-lib'

/**
 * Object numbers reachable from the trailer (Root, Info, Encrypt, ID).
 *
 * pdf-lib parses every indirect object in the byte stream — including objects
 * of earlier incremental revisions that nothing references any more, such as
 * the Info dictionary a previous save replaced — and writes them all back on
 * save. A sanitizer has to drop them, or the "removed" Title survives inside a
 * compressed object stream where no text search can see it (verified with a
 * two-revision fixture: the old Info came back as an orphan object).
 */
export function reachableRefs(context: PDFContext): Set<string> {
  const seen = new Set<string>()
  const stack: unknown[] = []
  const push = (value: unknown) => {
    if (value !== undefined && value !== null) stack.push(value)
  }
  const trailer = context.trailerInfo
  push(trailer.Root)
  push(trailer.Info)
  push(trailer.Encrypt)
  push(trailer.ID)
  while (stack.length > 0) {
    const value = stack.pop()
    if (value instanceof PDFRef) {
      const key = value.toString()
      if (seen.has(key)) continue
      seen.add(key)
      push(context.lookup(value))
    } else if (value instanceof PDFStream) {
      for (const [, entry] of value.dict.entries()) push(entry)
    } else if (value instanceof PDFDict) {
      for (const [, entry] of value.entries()) push(entry)
    } else if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) push(value.get(i))
    }
  }
  return seen
}

/** Indirect objects that nothing reachable from the trailer points to. */
export function unreachableRefs(context: PDFContext): PDFRef[] {
  const live = reachableRefs(context)
  return context
    .enumerateIndirectObjects()
    .map(([ref]) => ref)
    .filter((ref) => !live.has(ref.toString()))
}

/** Delete every unreachable object; returns how many were dropped. */
export function removeUnreachable(context: PDFContext): number {
  const orphans = unreachableRefs(context)
  for (const ref of orphans) context.delete(ref)
  return orphans.length
}
