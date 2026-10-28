// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMIT, ScanRateLimiter, WINDOW_MS } from './rateLimiter'

function limiter() {
  const data = new Map<string, unknown>()
  let alarm: number | null = null
  const storage = {
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => void data.set(key, value),
    setAlarm: async (time: number) => void (alarm = time),
    deleteAll: async () => void data.clear(),
  }
  const object = new ScanRateLimiter({ storage } as unknown as DurableObjectState)
  return {
    data,
    alarm: () => alarm,
    check: async () => (await object.fetch()).status,
    fireAlarm: () => object.alarm(),
  }
}

describe('ScanRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it(`allows ${LIMIT} checks per window and refuses the next`, async () => {
    const client = limiter()
    for (let i = 0; i < LIMIT; i++) expect(await client.check()).toBe(204)
    expect(await client.check()).toBe(429)
  })

  it('slides the window: a slot frees once the oldest check is a window old', async () => {
    const client = limiter()
    await client.check()
    vi.setSystemTime(1_000)
    for (let i = 1; i < LIMIT; i++) await client.check()
    vi.setSystemTime(WINDOW_MS - 1)
    expect(await client.check()).toBe(429)
    vi.setSystemTime(WINDOW_MS)
    expect(await client.check()).toBe(204)
    expect(await client.check()).toBe(429)
  })

  it('schedules cleanup a window after the newest check and forgets the client then', async () => {
    const client = limiter()
    await client.check()
    vi.setSystemTime(5_000)
    await client.check()
    expect(client.alarm()).toBe(5_000 + WINDOW_MS)
    await client.fireAlarm()
    expect(client.data.size).toBe(0)
  })
})
