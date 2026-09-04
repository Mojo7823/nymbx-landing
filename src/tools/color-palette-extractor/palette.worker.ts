/// <reference lib="webworker" />
import { expose } from 'comlink'
import { extractPalette } from './palette'

const api = {
  /**
   * Median-cut extraction over raw RGBA bytes of the (already downsampled)
   * analysis bitmap. Runs off the main thread so large photos stay smooth.
   */
  extract(rgba: Uint8ClampedArray, colorCount: number) {
    return extractPalette(rgba, { colorCount })
  },
}

export type PaletteWorkerApi = typeof api

expose(api)
