// Strict per-client limit for /api/phpscan: one Durable Object per client IP
// (idFromName) keeps the timestamps of its recent checks. A Durable Object
// handles one request at a time, so concurrent checks cannot race past the
// limit. This replaces the Workers Rate Limiting binding, which never denied a
// request in production (cloudflare/workers-sdk#16097).

export const LIMIT = 10
export const WINDOW_MS = 60_000

export class ScanRateLimiter implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  /** 204 when the client may run another check, 429 when it is over the limit. */
  async fetch(): Promise<Response> {
    const now = Date.now()
    const storage = this.state.storage
    const hits = ((await storage.get<number[]>('hits')) ?? []).filter((t) => now - t < WINDOW_MS)
    if (hits.length >= LIMIT) return new Response(null, { status: 429 })
    hits.push(now)
    await storage.put('hits', hits)
    // Forget the client once its newest check has aged out of the window.
    await storage.setAlarm(now + WINDOW_MS)
    return new Response(null, { status: 204 })
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }
}
