import { describe, expect, it, vi } from 'vitest'
import { createProgressGuard } from './worker'

describe('createProgressGuard', () => {
  it('forwards ticks to the callback before settling', () => {
    const onProgress = vi.fn()
    const guard = createProgressGuard(onProgress)
    guard.onProgress(10)
    guard.onProgress(50)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 10)
    expect(onProgress).toHaveBeenNthCalledWith(2, 50)
  })

  it('drops ticks arriving after settle (late Comlink messages)', () => {
    const onProgress = vi.fn()
    const guard = createProgressGuard(onProgress)
    guard.onProgress(10)
    guard.settle()
    guard.onProgress(90)
    guard.onProgress(100)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(10)
  })

  it('supports multi-argument callbacks and repeated settling', () => {
    const onProgress = vi.fn()
    const guard = createProgressGuard(onProgress)
    guard.onProgress(3, 10)
    expect(onProgress).toHaveBeenCalledWith(3, 10)
    guard.settle()
    guard.settle()
    guard.onProgress(10, 10)
    expect(onProgress).toHaveBeenCalledOnce()
  })
})
