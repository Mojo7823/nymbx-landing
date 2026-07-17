import { describe, expect, it } from 'vitest'
import { compareSizes } from './stats'

describe('compareSizes', () => {
  it('reports a reduction as negative percent change', () => {
    const c = compareSizes(1000, 250)
    expect(c.smaller).toBe(true)
    expect(c.percentChange).toBe(-75)
  })

  it('reports growth as positive percent change', () => {
    const c = compareSizes(1000, 1500)
    expect(c.smaller).toBe(false)
    expect(c.percentChange).toBe(50)
  })

  it('equal sizes are not smaller', () => {
    const c = compareSizes(1000, 1000)
    expect(c.smaller).toBe(false)
    expect(c.percentChange).toBe(0)
  })

  it('guards a zero-byte original', () => {
    expect(compareSizes(0, 500)).toEqual({ percentChange: 0, smaller: false })
  })
})
