import { optimize } from 'svgo/browser'

export interface OptimizeOptions {
  /** Keep the viewBox so scaled/responsive rendering is preserved. */
  keepViewBox: boolean
  /** Keep element IDs (off lets svgo minify or drop them). */
  keepIds: boolean
  /** Decimal places kept in coordinates and transforms (1–5). */
  precision: number
}

export function defaultOptions(): OptimizeOptions {
  // Precision 5 keeps the raster output pixel-identical (verified: lower
  // precisions shift antialiased edges); the slider still offers 1–4 for
  // users who prefer smaller files over exactness.
  return { keepViewBox: true, keepIds: true, precision: 5 }
}

export interface OptimizeResult {
  data: string
  inputBytes: number
  outputBytes: number
}

/**
 * Optimize an SVG string. Throws a human-readable Error when the input is
 * not parseable SVG — never returns a blank document.
 */
export function optimizeSvg(input: string, options: OptimizeOptions): OptimizeResult {
  const source = input.trim()
  if (source === '') throw new Error('Paste SVG markup or drop an .svg file first.')
  if (!/<svg[\s>]/i.test(source)) {
    throw new Error('This does not look like SVG markup — no <svg> root element found.')
  }
  const precision = Math.min(5, Math.max(1, Math.round(options.precision)))
  let data: string
  try {
    const result = optimize(source, {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            floatPrecision: precision,
            overrides: {
              ...(options.keepIds ? { cleanupIds: false } : {}),
              cleanupNumericValues: { floatPrecision: precision },
              convertPathData: { floatPrecision: precision },
            },
          },
        },
        // removeViewBox is not part of preset-default in svgo v4 — it only
        // runs when listed explicitly, and only when width/height match.
        ...(options.keepViewBox ? [] : [{ name: 'removeViewBox' } as const]),
      ],
    })
    data = result.data
  } catch (cause) {
    throw new Error(
      `Could not parse this SVG (${cause instanceof Error ? cause.message : String(cause)}). Make sure the markup is well-formed XML.`,
      { cause },
    )
  }
  if (!data.includes('<svg')) {
    throw new Error('Optimization produced an empty document — the input may be malformed.')
  }
  const inputBytes = new TextEncoder().encode(source).length
  return { data, inputBytes, outputBytes: new TextEncoder().encode(data).length }
}

/** Whole-percent savings (negative when the output grows). */
export function savingsPercent(inputBytes: number, outputBytes: number): number {
  if (inputBytes <= 0) return 0
  return Math.round((1 - outputBytes / inputBytes) * 100)
}
