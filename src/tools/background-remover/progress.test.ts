import { describe, expect, it } from 'vitest'
import { describeProgress } from './progress'

describe('describeProgress', () => {
  it('describes model downloads with byte progress', () => {
    const p = describeProgress('fetch:/models/medium', 44 * 1024 * 1024, 88 * 1024 * 1024)
    expect(p.label).toBe('Downloading AI model · 44 MB of 88 MB')
    expect(p.percent).toBeCloseTo(41)
  })

  it('describes runtime downloads', () => {
    const p = describeProgress('fetch:/onnxruntime-web/ort-wasm-simd-threaded.wasm', 0, 1024)
    expect(p.label).toContain('Downloading AI runtime')
    expect(p.percent).toBe(82)
  })

  it('handles unknown totals without a percentage', () => {
    const p = describeProgress('fetch:/models/small', 10, 0)
    expect(p.percent).toBeNull()
  })

  it('keeps inference progress near completion', () => {
    expect(describeProgress('compute:inference', 0, 0)).toEqual({
      label: 'Analyzing image…',
      percent: 95,
    })
    expect(describeProgress('compute:inference', 1, 1)).toEqual({
      label: 'Finishing image…',
      percent: 99,
    })
  })

  it('never moves backwards when the runtime starts after the model', () => {
    const modelDone = describeProgress('fetch:/models/small', 44, 44)
    const runtimeStart = describeProgress('fetch:/onnxruntime-web/runtime.wasm', 0, 10)
    const runtimeDone = describeProgress('fetch:/onnxruntime-web/runtime.wasm', 10, 10)

    expect(modelDone.percent).toBe(82)
    expect(runtimeStart.percent).toBe(82)
    expect(runtimeDone.percent).toBe(94)
  })
})
