import type { FeedbackRateLimitAdapter } from '../types'

type Bucket = {
  count: number
  resetAt: number
}

export type InMemoryRateLimitOptions = {
  limit: number
  windowMs: number
  now?: () => number
}

export function createInMemoryRateLimit({
  limit,
  windowMs,
  now = Date.now,
}: InMemoryRateLimitOptions): FeedbackRateLimitAdapter {
  const buckets = new Map<string, Bucket>()

  return async (key) => {
    const currentTime = now()
    const existing = buckets.get(key)
    const bucket =
      existing && existing.resetAt > currentTime
        ? existing
        : { count: 0, resetAt: currentTime + windowMs }

    bucket.count += 1
    buckets.set(key, bucket)

    if (bucket.count <= limit) return { ok: true }

    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
    }
  }
}
