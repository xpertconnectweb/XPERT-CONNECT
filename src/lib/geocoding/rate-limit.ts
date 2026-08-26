import { supabaseAdmin } from '@/lib/supabase'
import { RATE_LIMITS, RATE_LIMIT_WINDOW_SECONDS } from './constants'

/**
 * Per-user quotas on the geocoding proxy.
 *
 * There were none. Any authenticated user could hold the backspace key and
 * drive unlimited upstream calls; with a paid provider configured that is a
 * month's budget in an afternoon, and it does not take malice — a component
 * that re-renders in a loop does it by accident.
 *
 * Counted ONLY on a provider miss. A cache hit costs nothing, so charging
 * quota for one would let a popular query lock a user out for no reason: the
 * limit is on spend, not on searching.
 *
 * Two levels:
 *
 *  A. An in-process token bucket. Free, zero latency, and catches the runaway
 *     loop — which is the common case and the one that burns money fastest.
 *     Per-lambda, so it under-counts across instances; that is what B is for.
 *  B. An atomic claim in Postgres, following `claim_otp_send` in
 *     `2026-08-sms-notifications.sql`. The read-modify-write cannot be done
 *     through the PostgREST query builder and doing it in JS races: two
 *     concurrent requests both read the old count and both proceed.
 */

export type RateLimitKind = keyof typeof RATE_LIMITS

interface Bucket {
  windowStart: number
  count: number
}

const buckets = new Map<string, Bucket>()

function localAllows(userId: string, kind: RateLimitKind): boolean {
  const key = `${userId}|${kind}`
  const now = Date.now()
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 })
    return true
  }
  if (bucket.count >= RATE_LIMITS[kind]) return false
  bucket.count += 1
  return true
}

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until the window rolls over, for the `Retry-After` header. */
  retryAfter: number
}

/**
 * Claims one billable call.
 *
 * Fails OPEN if the database is unreachable. That is a deliberate trade: level
 * A still bounds a single instance, and refusing to geocode because the quota
 * table cannot be read would convert a database blip into a broken search box.
 * The exposure is bounded and temporary; the alternative is an outage.
 */
export async function claimGeocodeCall(
  userId: string,
  kind: RateLimitKind
): Promise<RateLimitDecision> {
  if (!localAllows(userId, kind)) {
    return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SECONDS }
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('claim_geocode_call', {
      p_user_id: userId,
      p_kind: kind,
      p_max: RATE_LIMITS[kind],
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })

    if (error) return { allowed: true, retryAfter: 0 }
    if (data === 'window_cap') {
      return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    }
    return { allowed: true, retryAfter: 0 }
  } catch {
    return { allowed: true, retryAfter: 0 }
  }
}

/** Exposed for tests; there is no other reason to clear the buckets. */
export function __clearRateLimitBuckets(): void {
  buckets.clear()
}
