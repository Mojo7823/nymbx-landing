/**
 * Minimal typings for fontkit 2 — the package ships no declarations.
 * Only the surface pdf-lib needs is described here; everything else is
 * handled through the adapter in `pdfFont.ts`.
 */
declare module 'fontkit' {
  export interface FontkitSubset {
    encode: () => Uint8Array
    encodeStream?: unknown
  }
  export interface FontkitGlyph {
    path: { commands: unknown[] }
  }
  export interface FontkitFont {
    numGlyphs: number
    createSubset: () => FontkitSubset
    getGlyph: (id: number) => FontkitGlyph
  }
  export function create(bytes: Uint8Array): FontkitFont
}
