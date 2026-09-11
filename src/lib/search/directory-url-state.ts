/**
 * Shareable state for the public directory, in the query string.
 *
 * Sibling to `url-state.ts`, which does the same job for the portal's
 * map, and pure for the same reason: no Next.js import, so it can be
 * unit-tested on its own and used anywhere a `URLSearchParams` exists.
 *
 * The directory had no URL state at all. A search could not be sent to
 * anyone, the back button walked out of the page rather than out of the
 * search, and the landing block's "View all 627 firms" button threw the
 * query away on the way to /directory — so the most natural path
 * through the feature was: search, find what you want, click through,
 * and land on an unfiltered list.
 *
 * `q` and `sort` are spelled the same as in `toMapUrlParams`, so the
 * two surfaces do not disagree about what a query parameter is called.
 * `tags` is deliberately NOT reused: the public surface holds exactly
 * one practice area at a time, and a list would imply otherwise.
 */

export type DirectorySort = 'relevance' | 'name'

export interface DirectoryUrlState {
  q?: string
  /** Exactly one practice area, matching the card UI. */
  area?: string
  /** Bare county, the storage convention — "Manatee", not "Manatee County". */
  county?: string
  sort?: DirectorySort
  /** How many rows were expanded, so Back returns to the same scroll depth. */
  show?: number
}

const SORTS: readonly DirectorySort[] = ['relevance', 'name']

/** Same page step the component uses; a link cannot ask for an odd number. */
const SHOW_STEP = 60
const MAX_SHOW = 3000

function clean(raw: string | null): string | undefined {
  if (raw === null) return undefined
  const value = raw.trim()
  return value.length > 0 ? value : undefined
}

/**
 * Never throws, whatever is in the URL.
 *
 * A query string is user input, and this runs during render. The map's
 * parser takes the same position: an unparseable parameter is absent,
 * not an error page.
 */
export function parseDirectoryUrlState(
  params: URLSearchParams | null | undefined
): DirectoryUrlState {
  if (!params) return {}

  const state: DirectoryUrlState = {}

  const q = clean(params.get('q'))
  if (q) state.q = q

  const area = clean(params.get('area'))
  if (area) state.area = area

  const county = clean(params.get('county'))
  if (county) state.county = county

  const sort = clean(params.get('sort'))
  if (sort && (SORTS as readonly string[]).includes(sort)) {
    state.sort = sort as DirectorySort
  }

  const show = Number(params.get('n'))
  if (Number.isFinite(show) && show > 0) {
    // Rounded up to a whole page and capped, so a hand-edited URL cannot
    // ask the browser to render the entire corpus at once.
    state.show = Math.min(MAX_SHOW, Math.ceil(show / SHOW_STEP) * SHOW_STEP)
  }

  return state
}

export function toDirectoryUrlParams(state: DirectoryUrlState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q?.trim()) params.set('q', state.q.trim())
  if (state.area) params.set('area', state.area)
  if (state.county) params.set('county', state.county)
  // Relevance is the default; writing it would put a parameter in every
  // URL that says nothing.
  if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort)
  if (state.show && state.show > SHOW_STEP) params.set('n', String(state.show))
  return params
}

/** `?a=b&c=d`, or an empty string when there is nothing to say. */
export function toDirectoryUrlQuery(state: DirectoryUrlState): string {
  const query = toDirectoryUrlParams(state).toString()
  return query ? `?${query}` : ''
}
