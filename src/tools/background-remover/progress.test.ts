import { describe, expect, it } from 'vitest'
import { describeProgress } from './progress'

describe('describeProgress', () => {
  it('describes model downloads with byte progress', () => {
    const p = describeProgress('fetch:/models/medium', 44 * 1024 * 1024, 88 * 1024 * 1024)
    expect(p.label).toBe('Downloading AI model — 44 MB of 88 MB')
    expect(p.percent).toBeCloseTo(50)
  })

  it('describes runtime downloads', () => {
    const p = describeProgress('fetch:/onnxruntime-web/ort-wasm-simd-threaded.wasm', 0, 1024)
    expect(p.label).toContain('Downloading runtime')
    expect(p.percent).toBe(0)
  })

  it('handles unknown totals without a percentage', () => {
    const p = describeProgress('fetch:/models/small', 10, 0)
    expect(p.percent).toBeNull()
  })

  it('describes inference without a percentage', () => {
    expect(describeProgress('compute:inference', 0, 0)).toEqual({
      label: 'Analyzing image…',
      percent: null,
    })
  })
})
