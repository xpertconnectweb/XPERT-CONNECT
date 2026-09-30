import 'server-only'
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Rate limits shared by every serverless instance.
 *
 * Backed by `claim_rate_limit` (scripts/migrations/2027-02-security-hardening.sql):
 * one atomic INSERT ... ON CONFLICT per call, so two instances cannot both
 * read the old count. An in-memory counter would reset on every cold start
 * and never see the traffic another instance served.
 *
 * Fails OPEN, like the geocoding limiter (src/lib/geocoding/rate-limit.ts).
 * A database blip must not take the contact form or the login down with it,
 * and these limits exist to stop abuse, not to guard correctness. That also
 * makes deploy order irrelevant: before the migration runs, the RPC is
 * missing and every call is simply allowed.
 */

export interface RateLimitRule {
  /** Namespaces the counter, e.g. 'login:user'. */
  bucket: string
  limit: number
  windowSeconds: number
}

export const RATE_LIMITS = {
  loginPerUser: { bucket: 'login:user', limit: 5, windowSeconds: 15 * 60 },
  loginPerIp: { bucket: 'login:ip', limit: 20, windowSeconds: 15 * 60 },
  contactPerIp: { bucket: 'contact:ip', limit: 5, windowSeconds: 60 * 60 },
  contactPerEmail: { bucket: 'contact:email', limit: 3, windowSeconds: 24 * 60 * 60 },
  newsletterPerIp: { bucket: 'newsletter:ip', limit: 5, windowSeconds: 60 * 60 },
  newsletterPerEmail: { bucket: 'newsletter:email', limit: 3, windowSeconds: 24 * 60 * 60 },
  inquiryPerIp: { bucket: 'inquiry:ip', limit: 10, windowSeconds: 60 * 60 },
  referralPerUser: { bucket: 'referral:user', limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>

/**
 * Keys are hashed before they reach the database, so the table never
 * holds a raw IP address or email. Peppered, because an unpeppered
 * SHA-256 of an IPv4 address is reversible by enumeration.
 */
export function hashKey(value: string): string {
  const pepper = process.env.PHONE_OTP_PEPPER || process.env.NEXTAUTH_SECRET || ''
  return crypto
    .createHmac('sha256', pepper)
    .update(value.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32)
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * The caller's IP. On Vercel both headers are set by the edge and a
 * client cannot forge the first hop, so the first `x-forwarded-for`
 * entry is the real client.
 */
export function clientIp(headers: HeaderSource): string {
  const real = readHeader(headers, 'x-real-ip')
  if (real) return real.trim()
  const forwarded = readHeader(headers, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

/** `true` when the call is within the limit — or when the check itself failed. */
export async function claimRateLimit(rule: RateLimitRule, rawKey: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('claim_rate_limit', {
      p_bucket: rule.bucket,
      p_key: hashKey(rawKey),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) {
      console.error('claim_rate_limit failed (allowing):', error.code, error.message)
      return true
    }
    return data !== false
  } catch (err) {
    console.error('claim_rate_limit threw (allowing):', err instanceof Error ? err.message : err)
    return true
  }
}

/**
 * Checks every rule and returns a 429 for the first one exceeded, or
 * null when the request may proceed. All rules are claimed, so a
 * request that trips one still counts against the others.
 */
export async function enforceRateLimits(
  checks: ReadonlyArray<readonly [RateLimitRule, string]>
): Promise<NextResponse | null> {
  const results = await Promise.all(checks.map(([rule, key]) => claimRateLimit(rule, key)))
  const tripped = results.findIndex((ok) => !ok)
  if (tripped === -1) return null
  return NextResponse.json(
    { ok: false, error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(checks[tripped][0].windowSeconds) },
    }
  )
}
