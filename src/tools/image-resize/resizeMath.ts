export type ResizeMode = 'pixels' | 'percent' | 'preset' | 'filesize'
export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp'

/** Below this longest edge, target-size search stops shrinking and ships best effort. */
export const MIN_TARGET_EDGE = 100

/**
 * Next scale to try when the smallest encoding at `scale` is still `size` bytes,
 * above `target`. Bytes grow ≈ area, so shrink by √(target/size) with a safety
 * margin — and always make real progress even when the estimate says otherwise.
 */
export function nextScale(scale: number, size: number, target: number): number {
  const estimated = scale * Math.sqrt(target / size) * 0.9
  return Math.min(estimated, scale * 0.9)
}

export interface Dimensions {
  width: number
  height: number
}

export interface ResizeSettings {
  mode: ResizeMode
  /** Pixels mode; null = not entered. */
  width: number | null
  height: number | null
  /** Pixels mode: keep each image's aspect ratio (fit within the box when both sides are set). */
  lockAspect: boolean
  percent: number
  /** Preset mode: target length of the longest edge. */
  presetEdge: number
}

const clamp = (n: number) => Math.max(1, Math.round(n))

/** Target dimensions for one source image under the current settings. */
export function computeTarget(src: Dimensions, s: ResizeSettings): Dimensions {
  if (s.mode === 'percent') {
    const scale = s.percent / 100
    return { width: clamp(src.width * scale), height: clamp(src.height * scale) }
  }

  if (s.mode === 'preset') {
    const scale = s.presetEdge / Math.max(src.width, src.height)
    return { width: clamp(src.width * scale), height: clamp(src.height * scale) }
  }

  // Pixels mode.
  if (!s.lockAspect) {
    return { width: clamp(s.width ?? src.width), height: clamp(s.height ?? src.height) }
  }
  if (s.width != null && s.height != null) {
    const scale = Math.min(s.width / src.width, s.height / src.height)
    return { width: clamp(src.width * scale), height: clamp(src.height * scale) }
  }
  if (s.width != null) {
    return { width: clamp(s.width), height: clamp((s.width / src.width) * src.height) }
  }
  if (s.height != null) {
    return { width: clamp((s.height / src.height) * src.width), height: clamp(s.height) }
  }
  return { width: src.width, height: src.height }
}

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** `photo.png` + image/jpeg + 800×600 → `photo-800x600.jpg`. */
export function outputFileName(originalName: string, mime: string, dims: Dimensions): string {
  const dot = originalName.lastIndexOf('.')
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName
  const ext = extensions[mime] ?? mime.replace(/^image\//, '')
  return `${stem}-${dims.width}x${dims.height}.${ext}`
}

/** Zip-safe unique names: appends ` (2)`, ` (3)`… before the extension on collision. */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count === 0) return name
    const dot = name.lastIndexOf('.')
    return dot > 0
      ? `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`
      : `${name} (${count + 1})`
  })
}
