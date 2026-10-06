export const FONT_URL = '/fonts/NotoSansTC-Regular.ttf'
const FONT_FAMILY = 'NYMBX Sign'
export const PREVIEW_FONT = `"${FONT_FAMILY}", system-ui, sans-serif`

let loading: Promise<void> | null = null

/** Match export metrics before exposing the editor; never load on an empty route. */
export function loadPreviewFont(): Promise<void> {
  loading ??= new FontFace(FONT_FAMILY, `url('${FONT_URL}') format('truetype')`)
    .load()
    .then((font) => {
      document.fonts.add(font)
    })
    .catch((error: unknown) => {
      // A failed FontFace cannot be loaded again. A retry creates a fresh face.
      loading = null
      throw error
    })
  return loading
}
