import type { Bounds, SortMode } from './types'

/**
 * Shareable map-search state, serialised to the query string.
 *
 * Pure and free of any Next.js import, so it can be unit-tested on its own and
 * used from anywhere that can produce a `URLSearchParams`.
 *
 * Backward compatibility is not optional here: `?near=<address>` is generated
 * by `ReferrerReferralForm`'s "View clinics near this client" link, and those
 * URLs are already out in the wild. It keeps working exactly as before.
 */

export interface MapUrlState {
  /** Free-text query. */
  q?: string
  /** Human-readable place text, geocoded on arrival. The original contract. */
  near?: string
  /** Resolved anchor. When present the geocoder is skipped entirely. */
  at?: [number, number]
  /** Radius in miles; 0 or absent means no radius limit. */
  radius?: number
  /** Viewport filter; its presence means "search this area" was used. */
  bbox?: Bounds
  zoom?: number
  tags?: string[]
  types?: ('clinic' | 'lawyer')[]
  availableOnly?: boolean
  sort?: SortMode
  /** Selected record, so a shared link can point at one provider. */
  selected?: string
}

const SORTS: readonly SortMode[] = ['relevance', 'distance', 'name', 'availability']

/** Coordinates are rounded so float noise cannot trigger pointless URL writes. */
const COORD_DP = 5
const BBOX_DP = 4

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function parseNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function parseCsv(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}

function parsePair(raw: string | null): [number, number] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',')
  if (parts.length !== 2) return undefined
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return [lat, lng]
}

function parseBounds(raw: string | null): Bounds | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined
  const [south, west, north, east] = parts
  if (south > north) return undefined
  return { south, west, north, east }
}

/** Never throws: a malformed parameter is ignored, not fatal. */
export function parseMapUrlState(params: URLSearchParams): MapUrlState {
  const state: MapUrlState = {}

  const q = params.get('q')?.trim()
  if (q) state.q = q

  const near = params.get('near')?.trim()
  if (near) state.near = near

  const at = parsePair(params.get('at'))
  if (at) state.at = at

  const radius = parseNumber(params.get('r'))
  if (radius !== undefined && radius > 0) state.radius = radius

  const bbox = parseBounds(params.get('bbox'))
  if (bbox) state.bbox = bbox

  const zoom = parseNumber(params.get('z'))
  if (zoom !== undefined) state.zoom = zoom

  const tags = parseCsv(params.get('tags'))
  if (tags) state.tags = tags

  const types = parseCsv(params.get('type'))?.filter(
    (t): t is 'clinic' | 'lawyer' => t === 'clinic' || t === 'lawyer'
  )
  if (types && types.length > 0) state.types = types

  if (params.get('avail') === '1') state.availableOnly = true

  const sort = params.get('sort')
  if (sort && (SORTS as readonly string[]).includes(sort)) state.sort = sort as SortMode

  const selected = params.get('sel')?.trim()
  if (selected) state.selected = selected

  return state
}

export function toMapUrlParams(state: MapUrlState): URLSearchParams {
  const params = new URLSearchParams()

  if (state.q) params.set('q', state.q)
  if (state.near) params.set('near', state.near)
  if (state.at) {
    params.set('at', `${round(state.at[0], COORD_DP)},${round(state.at[1], COORD_DP)}`)
  }
  if (state.radius) params.set('r', String(state.radius))
  if (state.bbox) {
    const { south, west, north, east } = state.bbox
    params.set(
      'bbox',
      [south, west, north, east].map((v) => round(v, BBOX_DP)).join(',')
    )
  }
  if (state.zoom !== undefined) params.set('z', String(Math.round(state.zoom)))
  if (state.tags && state.tags.length > 0) params.set('tags', state.tags.join(','))
  if (state.types && state.types.length > 0) params.set('type', state.types.join(','))
  if (state.availableOnly) params.set('avail', '1')
  if (state.sort) params.set('sort', state.sort)
  if (state.selected) params.set('sel', state.selected)

  return params
}

/** `?a=b&c=d`, or an empty string when there is nothing to record. */
export function toMapUrlQuery(state: MapUrlState): string {
  const params = toMapUrlParams(state)
  const query = params.toString()
  return query ? `?${query}` : ''
}
