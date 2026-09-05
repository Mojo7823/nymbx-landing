import { describe, expect, it } from 'vitest'
import { severityOf } from './severity'

describe('severityOf', () => {
  it('maps each band, including its boundaries', () => {
    expect(severityOf(0)).toBe('None')
    expect(severityOf(0.1)).toBe('Low')
    expect(severityOf(3.9)).toBe('Low')
    expect(severityOf(4.0)).toBe('Medium')
    expect(severityOf(6.9)).toBe('Medium')
    expect(severityOf(7.0)).toBe('High')
    expect(severityOf(8.9)).toBe('High')
    expect(severityOf(9.0)).toBe('Critical')
    expect(severityOf(10)).toBe('Critical')
  })
})
