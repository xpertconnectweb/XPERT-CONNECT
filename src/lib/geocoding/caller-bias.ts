import { getClinicById, getLawyerById } from '@/lib/data'
import { validateCoordinates } from '@/lib/validation'
import { quantizeProximity } from './bias'

/**
 * Where the caller is, when the caller did not say.
 *
 * `/api/geocode` already reads the caller's STATE server-side and never accepts
 * it from the client (`bias.ts`). This is the same idea one step finer: a clinic
 * user and a law-firm user each belong to a row that has coordinates, and a
 * search made by someone sitting in Bradenton almost certainly means an address
 * near Bradenton.
 *
 * Without it the only geographic hint is the state bounding box, and Florida is
 * a rectangle 700 km tall. Typing "862 62nd" with no city and no postcode was
 * answering with a street in Minnesota.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * Not a filter. It reaches the providers as `ctx.proximity`, which every adapter
 * translates into a soft bias and never a restriction — Mapbox gets `proximity`
 * and not `bbox`, Google gets `locationBias` and not `locationRestriction`. A
 * clinic in Bradenton must still be able to look up an address in Miami.
 *
 * Not for everyone. A `referrer` belongs to no entity at all and an `admin`
 * belongs to no entity worth biasing toward, so both get null and fall back to
 * the state box exactly as before.
 *
 * And never sent to the browser. The caller's own office coordinates are not
 * secret from the caller, but there is no reason for them to make the round
 * trip, and keeping the resolution server-side means one code path serves every
 * caller of `/api/geocode` rather than three components remembering to pass a
 * prop.
 */

export interface CallerBias {
  lat: number
  lng: number
  zoom: number
}

/**
 * The zoom this bias claims to be looking at.
 *
 * Not a real viewport — there is no map here. Google turns zoom into a search
 * radius (`radiusForZoom` in `bias.ts`), and 12 puts that at roughly 10 km:
 * about a metropolitan area, which is the scale at which "the office is nearby"
 * is a useful hint and beyond which it stops being one.
 */
const OFFICE_ZOOM = 12

/**
 * How long a resolved office is trusted, in milliseconds.
 *
 * This runs on the autocomplete path, which fires per keystroke, so an
 * unconditional database read here would add a round trip to every letter
 * typed. Five minutes matches how often `src/lib/auth.ts` refreshes the session
 * from the database, so the two go stale together rather than disagreeing.
 */
const TTL_MS = 5 * 60 * 1000

interface Entry {
  at: number
  value: CallerBias | null
}

/**
 * Per-process, like `memory-cache.ts` and for the same reason: on Vercel each
 * lambda keeps its own, a cold start simply pays one extra read, and there is
 * nothing here worth the complexity of a shared cache.
 */
const cache = new Map<string, Entry>()

/** A user whose entity link may point at coordinates. */
export interface BiasSubject {
  id: string
  clinicId?: string
  lawyerId?: string
}

/**
 * The caller's own location, or null when they have none.
 *
 * Quantised on the way out. It becomes part of the geocoding cache key through
 * `biasKey`, and an unrounded coordinate would give every user their own copy
 * of every cached answer.
 */
export async function resolveCallerBias(user: BiasSubject | null | undefined): Promise<CallerBias | null> {
  if (!user) return null

  const entityId = user.clinicId ?? user.lawyerId
  if (!entityId) return null

  const key = `${user.id}|${entityId}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at <= TTL_MS) return cached.value

  let value: CallerBias | null = null
  try {
    const entity = user.clinicId
      ? await getClinicById(user.clinicId)
      : await getLawyerById(user.lawyerId as string)

    // The same guard the admin write path uses. Rows at (0, 0) are still in
    // this table — `validateCoordinates` exists because they got in — and
    // biasing every search toward the Gulf of Guinea would be considerably
    // worse than having no bias at all.
    if (entity) {
      const checked = validateCoordinates(entity.lat, entity.lng)
      if (checked.ok) {
        value = { ...quantizeProximity(checked.lat, checked.lng, OFFICE_ZOOM) }
      }
    }
  } catch {
    // A bias is a nicety. If the lookup fails the search still works, and
    // failing the whole request over a hint would be the wrong trade.
    value = null
  }

  cache.set(key, { at: Date.now(), value })
  return value
}

/** Test seam, matching `__clearMemoryCache`. */
export function __clearCallerBiasCache(): void {
  cache.clear()
}
