/**
 * US address parsing.
 *
 * Neither `clinics` nor `lawyers` stores city/state separately — everything
 * geographic beyond `region`/`county` is packed into the free-text `address`
 * column. Searching by ZIP or city therefore has to start here.
 *
 * The corpus is messy in ways that rule out the obvious implementations:
 *
 *  - Comma counts vary (3, 2 and 1-segment forms all occur), so splitting on
 *    commas and indexing from the front does not work.
 *  - 14 clinic rows hold a city-only string ("Melbourne, FL") or prose
 *    ("Janet Ct / Spring Hill area (consultar ubicacion exacta por llamada)").
 *  - Some rows carry a parenthetical suffix ("Wesley Chapel, FL (Pasco County)").
 *  - Trailing whitespace is not normalized ("Clearwater, MN  ").
 *
 * So the parser is *suffix-anchored*: find the state (and ZIP, if present) at
 * the end, and treat everything before it as the head to split. That is the
 * only part of a US address whose position is reliable here.
 *
 * This module is intentionally free of React, Leaflet and Supabase so it can be
 * imported from API routes, migration scripts and the search core alike.
 */

export interface AddressParts {
  street: string | null
  city: string | null
  /** Two-letter uppercase code. */
  state: string | null
  /** Five digits; ZIP+4 is truncated. */
  zip: string | null
  /**
   * False when the input was prose, or when a state could only be guessed from
   * a loose scan. Callers that need trustworthy geography (state scoping, ZIP
   * search) should treat a low-confidence parse as "unknown", not as data.
   */
  confident: boolean
}

const EMPTY: AddressParts = {
  street: null,
  city: null,
  state: null,
  zip: null,
  confident: false,
}

/** Every US state/territory code, so the loose scan can't invent one. */
export const US_STATE_CODES: ReadonlySet<string> = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
])

/**
 * "FL 32501" / "FL 32501-1234" at the very end.
 *
 * The trailing `(?:[\s,]+\d{5}(?:-\d{4})?)*` tolerates a repeated ZIP — l-002
 * is stored as "21 Park Lake St, Orlando, FL 32803 32801". Without it the
 * anchor misses and the row falls through to the loose scan, losing its city.
 */
const STATE_ZIP_TAIL =
  /\b([A-Za-z]{2})\.?[\s,]+(\d{5})(?:-\d{4})?(?:[\s,]+\d{5}(?:-\d{4})?)*\s*$/
/** ", FL" at the very end — the city-only form that broke state scoping. */
const STATE_TAIL = /,\s*([A-Za-z]{2})\.?\s*$/
/** A bare ZIP anywhere, used only as a last resort. */
const LOOSE_ZIP = /\b(\d{5})(?:-\d{4})?\b/
const PARENTHETICAL = /\([^)]*\)/g

/** ALL-CAPS city names are title-cased; mixed case is left alone. */
function tidyCity(raw: string): string | null {
  const value = raw.replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')
  if (!value) return null
  if (value !== value.toUpperCase()) return value
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
}

function tidyStreet(raw: string): string | null {
  const value = raw.replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')
  return value || null
}

/**
 * Splits the pre-state portion into street + city. The city is the last
 * comma-separated segment; anything before it is the street.
 *
 * A single segment is ambiguous: "Melbourne" is a city, "1117 N Palafox St" is
 * a street. We use the presence of a leading house number to decide, which is
 * right for every shape in the corpus.
 */
function splitHead(head: string): { street: string | null; city: string | null } {
  const segments = head
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) return { street: null, city: null }
  if (segments.length === 1) {
    const only = segments[0]
    return /^\d/.test(only)
      ? { street: tidyStreet(only), city: null }
      : { street: null, city: tidyCity(only) }
  }
  return {
    street: tidyStreet(segments.slice(0, -1).join(', ')),
    city: tidyCity(segments[segments.length - 1]),
  }
}

/**
 * Parses a US address into its parts. Never throws; unparseable input comes
 * back as all-null with `confident: false`.
 */
export function parseAddress(raw: string | null | undefined): AddressParts {
  if (typeof raw !== 'string') return EMPTY

  // Parentheticals are annotations, not address structure — "(Pasco County)",
  // "(consultar ubicacion exacta por llamada)". Dropping them first lets the
  // suffix anchors match the rows that carry them.
  const cleaned = raw.replace(PARENTHETICAL, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!cleaned) return EMPTY

  const zipTail = cleaned.match(STATE_ZIP_TAIL)
  if (zipTail) {
    const state = zipTail[1].toUpperCase()
    if (US_STATE_CODES.has(state)) {
      const head = cleaned.slice(0, zipTail.index).trim()
      const { street, city } = splitHead(head)
      return { street, city, state, zip: zipTail[2], confident: city !== null }
    }
  }

  const stateTail = cleaned.match(STATE_TAIL)
  if (stateTail) {
    const state = stateTail[1].toUpperCase()
    if (US_STATE_CODES.has(state)) {
      const head = cleaned.slice(0, stateTail.index).trim()
      const { street, city } = splitHead(head)
      return { street, city, state, zip: null, confident: city !== null }
    }
  }

  // Loose scan: a state code somewhere in the middle. This is the prose case,
  // so we take the state (it drives scoping and is usually right) but refuse to
  // guess a city — a wrong city is worse than no city for both search and
  // display.
  //
  // The token must already be UPPERCASE in the source. Half the state codes
  // collide with ordinary words and street suffixes ("Ct" Court -> CT, "In",
  // "Or", "La", "Me", "Pa"), and unlike the two anchors above this scan has no
  // positional evidence to lean on. Case is the only signal left: c-336
  // ("Janet Ct / Spring Hill area") was being filed under Connecticut.
  for (const token of cleaned.split(/[\s,]+/)) {
    const candidate = token.replace(/\./g, '')
    if (candidate !== candidate.toUpperCase()) continue
    if (candidate.length === 2 && US_STATE_CODES.has(candidate)) {
      const zip = cleaned.match(LOOSE_ZIP)
      return {
        street: null,
        city: null,
        state: candidate,
        zip: zip ? zip[1] : null,
        confident: false,
      }
    }
  }

  return EMPTY
}

/**
 * The coarse, contact-free location label safe to expose on the professional
 * and partner maps, where street and phone are deliberately withheld.
 *
 * "1000 Legion Pl #1000, Orlando, FL 32801" -> "Orlando, FL 32801"
 */
export function publicLocationLabel(parts: AddressParts): string | null {
  if (!parts.city && !parts.state) return null
  const head = [parts.city, parts.state].filter(Boolean).join(', ')
  return parts.zip ? `${head} ${parts.zip}` : head || null
}

/**
 * Removes apartment/unit designators from an address.
 *
 * Nominatim's free-text `q=` search returns an EMPTY array when the string
 * contains a unit designator (Apt 4B, #1402, Suite 200...), which was the root
 * cause of "only the bare ZIP works" in the clinic map. Verified live against
 * nominatim.openstreetmap.org.
 *
 * Deliberately absent: a bare `fl` token. It collides with the "FL" state
 * abbreviation and stripping it would delete the state and ZIP.
 */
export function stripUnit(address: string): string {
  return address
    .replace(
      /,?\s*(?:#\s*\w[\w-]*|\b(?:apt|apartment|suite|ste|unit|floor|bldg|building|rm|room)\b\.?\s*#?\s*\w[\w-]*)/gi,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*,\s*,/g, ',')
    .trim()
}

/**
 * Splits a geocoded address into the two lines a person reads.
 *
 * Line one is the street, line two the "city, ST ZIP" tail — the part that
 * tells you whether the geocoder understood you. Rendering them with different
 * weight is the whole reason `/api/geocode` keeps the components instead of
 * one flattened string.
 *
 * Falls back to the upstream's own label when there are no components, which
 * happens for regions and some POIs.
 */
export function formatGeocodeLines(
  address: {
    street?: string | null
    city?: string | null
    state?: string | null
    postcode?: string | null
  } | null | undefined,
  fallback: string
): { primary: string; secondary: string | null } {
  if (!address) return { primary: fallback, secondary: null }

  const tail = [address.city, address.state].filter(Boolean).join(', ')
  const secondary = address.postcode ? `${tail} ${address.postcode}`.trim() : tail || null

  // A ZIP or city search has no street. Promoting the tail keeps the chip from
  // leading with an empty line.
  if (!address.street) return { primary: secondary ?? fallback, secondary: null }

  return { primary: address.street, secondary }
}

/** One-line form, for places that cannot show two lines (the URL, a tooltip). */
export function formatGeocodeLabel(
  address: Parameters<typeof formatGeocodeLines>[0],
  fallback: string
): string {
  const { primary, secondary } = formatGeocodeLines(address, fallback)
  return secondary ? `${primary}, ${secondary}` : primary
}
