import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { biasKey, parseProximity } from '@/lib/geocoding/bias'
import {
  DEFAULT_LIMIT,
  MAX_GEOCODE_QUERY,
  MAX_LIMIT,
  GEOCODE_CACHE_REVISION,
  MIN_GEOCODE_QUERY,
} from '@/lib/geocoding/constants'
import { autocompleteChain, getProvider, getProviderById } from '@/lib/geocoding'
import { memoryGet, memorySet } from '@/lib/geocoding/memory-cache'
import { claimGeocodeCall } from '@/lib/geocoding/rate-limit'
import { deriveSessionToken, isValidSid } from '@/lib/geocoding/session'
import { sharedGet, sharedSet } from '@/lib/geocoding/shared-cache'
import { providerMatches } from '@/lib/geocoding/types'
import type { GeocodeContext } from '@/lib/geocoding/types'
import type { GeocodeProviderId, GeocodeSuggestion } from '@/types/geocode'

/**
 * Server-side proxy for address lookup.
 *
 * The map used to call nominatim.openstreetmap.org straight from the browser.
 * Proxying instead buys three things:
 *
 *  1. A real `User-Agent`. Nominatim's usage policy requires one, and browsers
 *     silently drop the header — so the old client-side call identified us as
 *     nobody, which is exactly what gets an IP blocked.
 *  2. A shared cache. Coordinates for an address do not change, so a hit here
 *     serves every user instantly and never touches the upstream.
 *  3. Privacy. This is a personal-injury referral tool: the addresses being
 *     geocoded are clients' home addresses, and they were being sent to a
 *     third party from the user's own browser.
 *
 * Point 3 is why `next.config.js` still lists no geocoding host in `connect-src`
 * and why it must stay that way whichever provider is configured — the browser
 * has no reason to reach any of them, and an API key never leaves the server.
 *
 * The provider itself lives behind `src/lib/geocoding`. This handler is
 * transport: authenticate, validate, cache, meter, delegate.
 *
 * Three modes on one GET:
 *   ?q=…                       autocomplete
 *   ?id=…&provider=…           resolve a suggestion to coordinates
 *   ?lat=…&lng=…               reverse
 */

export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=3600' } as const

function respond(
  body: unknown,
  cache: 'hit' | 'miss',
  source: 'memory' | 'shared' | 'provider'
): NextResponse {
  return NextResponse.json(body, {
    headers: { ...CACHE_HEADERS, 'X-Geocode-Cache': cache, 'X-Geocode-Source': source },
  })
}

/** Roughly a metre. Precise enough for an address, coarse enough to cache. */
function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5
}

/**
 * Maps a provider failure onto a status code.
 *
 * `rate_limited` upstream becomes 503 rather than 429: a 429 here would tell
 * the user THEY are being throttled, when in fact our account is.
 */
function statusForFailure(kind: string): { status: number; error: string } {
  switch (kind) {
    case 'config':
      return { status: 503, error: 'Geocoding is not configured' }
    case 'bad_id':
      return { status: 400, error: 'Unknown suggestion' }
    case 'rate_limited':
      return { status: 503, error: 'Geocoding service is busy' }
    default:
      return { status: 502, error: 'Geocoding service unavailable' }
  }
}

export async function GET(request: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const params = new URL(request.url).searchParams
  const userId = session.user?.id ?? 'anonymous'

  // The session token is derived server-side from the caller's opaque `sid`,
  // never forwarded verbatim. See `session.ts` for why.
  const sid = params.get('sid')
  if (sid !== null && !isValidSid(sid)) {
    return NextResponse.json({ error: 'sid must be a UUID' }, { status: 400 })
  }

  const ctx: GeocodeContext = {
    state: session.user?.state ?? null,
    proximity: parseProximity(params.get('prox')),
    sessionToken: sid ? deriveSessionToken(userId, sid) : null,
    limit: DEFAULT_LIMIT,
  }

  const provider = getProvider()

  // ── Reverse mode ────────────────────────────────────────────────────────
  if (params.has('lat') && params.has('lng')) {
    const latParam = Number(params.get('lat'))
    const lngParam = Number(params.get('lng'))
    if (
      !Number.isFinite(latParam) ||
      !Number.isFinite(lngParam) ||
      Math.abs(latParam) > 90 ||
      Math.abs(lngParam) > 180
    ) {
      return NextResponse.json({ error: 'lat and lng must be valid coordinates' }, { status: 400 })
    }

    const lat = roundCoord(latParam)
    const lng = roundCoord(lngParam)
    const key = `${provider.id}|v${GEOCODE_CACHE_REVISION}|rev|${lat},${lng}`

    const local = memoryGet(key)
    if (local) return respond(local, 'hit', 'memory')

    const shared = await sharedGet(key)
    if (shared) {
      memorySet(key, shared)
      return respond(shared, 'hit', 'shared')
    }

    const gate = await claimGeocodeCall(userId, 'reverse')
    if (!gate.allowed) {
      return NextResponse.json(
        { error: 'Too many lookups' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } }
      )
    }

    const result = await provider.reverse(lat, lng, ctx)
    if (!result.ok) {
      const { status, error: message } = statusForFailure(result.kind)
      return NextResponse.json({ error: message === 'Geocoding service unavailable' ? 'Reverse lookup failed' : message }, { status })
    }

    // No upstream match is not an error: the sea, a field, a private lot.
    // The caller still has coordinates and can say "Custom location".
    const results = result.value ? [result.value] : []
    memorySet(key, results)
    await sharedSet(key, provider.id, 'reverse', results)
    return respond(results, 'miss', 'provider')
  }

  // ── Resolve mode ────────────────────────────────────────────────────────
  // Google and Mapbox withhold coordinates from autocomplete; this is where a
  // chosen suggestion becomes a point on the map.
  const id = params.get('id')
  if (id) {
    const requested = params.get('provider')
    if (!providerMatches(requested, provider.id)) {
      return NextResponse.json(
        { error: 'That suggestion was issued by a different provider' },
        { status: 400 }
      )
    }

    const target = requested ? getProviderById(requested as GeocodeProviderId) : provider
    const key = `${target.id}|v${GEOCODE_CACHE_REVISION}|det|${id}`

    const local = memoryGet(key)
    if (local) return respond(local, 'hit', 'memory')

    const shared = await sharedGet(key)
    if (shared) {
      memorySet(key, shared)
      return respond(shared, 'hit', 'shared')
    }

    const gate = await claimGeocodeCall(userId, 'details')
    if (!gate.allowed) {
      return NextResponse.json(
        { error: 'Too many lookups' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } }
      )
    }

    const result = await target.details(id, ctx)
    if (!result.ok) {
      const { status, error: message } = statusForFailure(result.kind)
      return NextResponse.json({ error: message }, { status })
    }

    const results = result.value ? [result.value] : []
    memorySet(key, results)
    await sharedSet(key, target.id, 'details', results)
    return respond(results, 'miss', 'provider')
  }

  // ── Autocomplete mode ───────────────────────────────────────────────────
  const raw = (params.get('q') ?? '').trim()
  if (raw.length < MIN_GEOCODE_QUERY || raw.length > MAX_GEOCODE_QUERY) {
    return NextResponse.json(
      { error: `Query must be between ${MIN_GEOCODE_QUERY} and ${MAX_GEOCODE_QUERY} characters` },
      { status: 400 }
    )
  }

  const limitParam = Number(params.get('limit'))
  ctx.limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  // The bias is part of the key because it changes the answer. It is quantised
  // upstream of here precisely so this stays low-cardinality and the cache
  // keeps hitting.
  const key = `${provider.id}|v${GEOCODE_CACHE_REVISION}|ac|${raw.toLowerCase()}|${ctx.limit}|${biasKey(ctx)}`

  const local = memoryGet(key)
  if (local) return respond(local, 'hit', 'memory')

  const shared = await sharedGet(key)
  if (shared) {
    memorySet(key, shared)
    return respond(shared, 'hit', 'shared')
  }

  const gate = await claimGeocodeCall(userId, 'autocomplete')
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many lookups' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } }
    )
  }

  const outcome = await autocompleteChain(raw, ctx)
  if (outcome.failure) {
    const { status, error: message } = statusForFailure(outcome.failure.kind)
    return NextResponse.json({ error: message }, { status })
  }

  const results: GeocodeSuggestion[] = outcome.suggestions
  // Empty results are cached too — otherwise every keystroke of a
  // known-unresolvable prefix re-runs the whole candidate chain.
  memorySet(key, results)
  await sharedSet(key, outcome.provider, 'autocomplete', results)

  return respond(results, 'miss', 'provider')
}
