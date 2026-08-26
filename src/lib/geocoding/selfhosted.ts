/**
 * The self-hosted geocoder, as a provider.
 *
 * Phase 5, and by design the smallest file of the six. Everything that makes
 * this engine work is elsewhere -- the county data, the packing codec, the
 * parser, the ranking -- and this only dresses it in the interface the rest of
 * the application already speaks. The caching, the per-user quotas, the session
 * tokens, the proximity bias and the whole UI treat it exactly like Geoapify,
 * because to them it is exactly like Geoapify.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 *
 * Not saving money: Geoapify's free tier covers this platform's volume ten
 * times over and costs nothing. Three other things:
 *
 *   Privacy. These are the home addresses of personal-injury clients. The
 *   browser has never been allowed to talk to a geocoder directly -- see
 *   next.config.js:56 -- but the server still did. Now nothing leaves at all.
 *
 *   Honest precision. Measured over 201 county-verified addresses, Geoapify
 *   labelled 100% of its answers `rooftop` while 71% were within 50 m and nine
 *   were over a kilometre out. `isExactPrecision` gates the "approximate, drag
 *   the pin to correct it" prompt, so it never appeared on a result that
 *   needed it. Here `rooftop` means the county register holds that exact house
 *   number, and anything less says so.
 *
 *   Independence. No daily cap, no terms that can change, nothing that can
 *   start charging. The attribution clause does NOT go away -- Manatee County
 *   publishes under CC BY 4.0 and it is not the only one -- so the credit line
 *   stays, naming the registers instead of a vendor. It is the one obligation
 *   that survives dropping the provider.
 *
 * ── What it deliberately is not ─────────────────────────────────────────────
 *
 * Postal addresses in Florida and Minnesota. It does not find businesses by
 * name, does not read natural language, and knows nothing outside those two
 * states. Those were scope decisions, not omissions, and the fallback chain in
 * `index.ts` is what covers anything outside them.
 */
import { formatGeocodeLabel } from '@/lib/address'
import type {
  GeocodeAddress,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'
import { parseUsAddress, type ParsedUsAddress } from './address-parser'
import type { GeocodeContext, GeocodeProvider, ProviderResult } from './types'
import {
  MIN_GEOCODE_QUERY,
  REVERSE_CANDIDATES,
  REVERSE_COVERAGE_M,
  REVERSE_NUMBER_M,
  REVERSE_ROOFTOP_M,
  REVERSE_SEARCH_RADIUS_DEG,
} from './constants'
import { nearestPoint, type NearestPoint } from './payload-codec'
import {
  precisionOf,
  rankStreets,
  resolveNumbers,
  searchStreets,
  streetCentre,
  supabaseStreetStore,
  type RankedStreet,
  type StreetRow,
  type StreetStore,
} from './street-index'

/**
 * A suggestion id: the street row, then the house number that was typed.
 *
 * Both halves are needed. The street alone would resolve to the middle of the
 * block on the round trip, and the number alone means nothing. `-` for "no
 * number given", so the id is always parseable.
 */
function suggestionId(street: RankedStreet, number: number | null): string {
  return `${street.id}:${number ?? '-'}`
}

function parseSuggestionId(id: string): { streetId: number; number: number | null } | null {
  const match = /^(\d+):(\d+|-)$/.exec(id)
  if (!match) return null
  return { streetId: Number(match[1]), number: match[2] === '-' ? null : Number(match[2]) }
}

/**
 * `GeocodeAddress` is pinned with `toEqual` by tests/api/geocode.test.ts:90.
 * Four fields, in this shape, and nothing else may be added to it.
 */
function addressOf(street: RankedStreet, parsed: ParsedUsAddress): GeocodeAddress {
  return {
    street: parsed.number !== null ? `${parsed.number} ${street.name_display}` : street.name_display,
    city: street.city,
    state: street.state,
    postcode: street.zip,
  }
}

function toSuggestion(
  street: RankedStreet,
  parsed: ParsedUsAddress,
  coordinates: { lat: number; lng: number } | null,
  precision: GeocodeSuggestion['precision']
): GeocodeSuggestion {
  const address = addressOf(street, parsed)
  const id = suggestionId(street, parsed.number)
  const fallback = [address.street, address.city].filter(Boolean).join(', ')

  return {
    id,
    label: formatGeocodeLabel(address, fallback),
    fullLabel: [address.street, address.city, [address.state, address.postcode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    address,
    // The registers publish a county per point, but it is dropped at index time
    // -- it does not take part in the key, and 567,000 copies of a county name
    // is several megabytes of a 500 MB budget spent on a facet the address
    // search does not use.
    county: null,
    kind: 'address',
    precision,
    providerId: 'selfhosted',
    placeId: id,
    lat: coordinates ? coordinates.lat : null,
    lng: coordinates ? coordinates.lng : null,
    bbox: [street.lat_min, street.lat_max, street.lng_min, street.lng_max],
    needsResolve: coordinates === null,
  }
}

/**
 * Builds the provider over a given store.
 *
 * Exported so the Phase 4 benchmark can run this exact code against an
 * in-memory copy of the index. A benchmark that measured a reimplementation
 * would be measuring the wrong thing.
 */
export function createSelfHostedProvider(store: StreetStore): GeocodeProvider {
  return {
    id: 'selfhosted',

    /**
     * False: coordinates come back with the suggestions.
     *
     * The other providers withhold them because their billing charges for a
     * resolve, so a cheap list plus one chargeable lookup is the shape their
     * pricing forces. Nothing is charged here, and one extra primary-key read
     * per keystroke is worth a map that moves as soon as a suggestion appears.
     */
    needsDetails: false,

    /**
     * An empty answer IS authoritative, within Florida and Minnesota. If the
     * county register does not hold an address, no third party's copy of that
     * same register will either.
     *
     * True nonetheless, because the chain's fallback is what covers the
     * addresses this engine was never meant to serve -- another state, a
     * business by name -- and refusing to hand those on would be a regression
     * from what ships today.
     */
    fallbackOnEmpty: true,

    /**
     * Configured when Supabase is. There is no API key: that is the point.
     *
     * The tables themselves are not checked here. `configured()` runs on every
     * request and a round trip per keystroke to ask whether a table exists
     * would cost more than it protects; a missing table surfaces as an upstream
     * failure, which the chain already handles, and /api/health checks it once.
     */
    configured() {
      return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    },

    /**
     * An empty answer is an answer only where the register is actually held.
     *
     * Three conditions, and each removes a way of being wrong:
     *
     *   A house number. Without one the query may be a business, a city or a
     *   landmark — "Bayfront Health, Punta Gorda" parses as a street called
     *   Bayfront Health, and Geoapify finds the clinic. Declining those would
     *   lose the half of the product this engine never claimed to serve.
     *
     *   A street. Nothing to be authoritative about otherwise.
     *
     *   Coverage of the place named. This is the one that matters: Houston
     *   County, Minnesota publishes no register, so every address in it is
     *   absent from the index and none of those absences is evidence. Asking
     *   whether the index holds ANY street in that postcode separates "no such
     *   address" from "no register".
     */
    async answersEmptyAuthoritatively(query: string, ctx: GeocodeContext): Promise<boolean> {
      const parsed = parseUsAddress(query)
      if (parsed.number === null || parsed.variants.length === 0) return false

      const state = ctx.state ?? parsed.state
      if (!state) return false

      try {
        return await store.covers(state, parsed.zip, parsed.city)
      } catch {
        return false
      }
    },

    async autocomplete(query: string, ctx: GeocodeContext): Promise<ProviderResult<GeocodeSuggestion[]>> {
      if (query.trim().length < MIN_GEOCODE_QUERY) return { ok: true, value: [] }

      const parsed = parseUsAddress(query)
      if (parsed.variants.length === 0) return { ok: true, value: [] }

      let rows
      try {
        rows = await searchStreets(store, parsed, { state: ctx.state ?? parsed.state })
      } catch {
        return { ok: false, kind: 'upstream' }
      }

      const ranked = rankStreets(parsed, rows, {
        proximity: ctx.proximity ? { lat: ctx.proximity.lat, lng: ctx.proximity.lng } : null,
        limit: ctx.limit,
      })

      // One request for every blob, not one per suggestion. Measured against
      // the live database, eight in a single query cost 226 ms and one cost
      // 218 -- the round trip is the whole price.
      const matches = await resolveNumbers(store, ranked.map((s) => s.id), parsed.number)

      const suggestions = ranked.map((street) => {
        const match = matches.get(street.id)
        // A street whose blob is missing is a load that did not finish. Show
        // the street rather than nothing: the centre of its bounding box is
        // honest at `street` precision, and the pin can be dragged.
        if (!match) return toSuggestion(street, parsed, streetCentre(street), 'street')
        return toSuggestion(
          street,
          parsed,
          { lat: match.lat, lng: match.lng },
          precisionOf(match, street.agreement)
        )
      })

      return { ok: true, value: suggestions }
    },

    /**
     * Rarely called -- `needsDetails` is false, so the route resolves from the
     * suggestion it already holds. Implemented properly anyway: a client that
     * stored a `placeId` weeks ago and asks for it again has to get an answer,
     * and this is the path that gives one without a search.
     */
    async details(id: string): Promise<ProviderResult<GeocodeResult | null>> {
      const parsedId = parseSuggestionId(id)
      if (!parsedId) return { ok: false, kind: 'bad_id' }

      let match
      try {
        match = (await resolveNumbers(store, [parsedId.streetId], parsedId.number)).get(parsedId.streetId) ?? null
      } catch {
        return { ok: false, kind: 'upstream' }
      }
      if (!match) return { ok: true, value: null }

      // The street row is not fetched again: everything shown comes from the
      // stored placeId and the blob. The label is rebuilt from what the caller
      // already has, which is why `details` never needs the search path.
      const parsed = parseUsAddress('')
      const stub: RankedStreet = {
        id: parsedId.streetId,
        name_norm: '',
        name_display: '',
        city: '',
        state: '',
        zip: '',
        num_min: 0,
        num_max: 0,
        lat_min: match.lat,
        lat_max: match.lat,
        lng_min: match.lng,
        lng_max: match.lng,
        point_count: 0,
        score: 1,
        rank: 1,
        nameScore: 1,
        numberInRange: match.kind === 'exact',
        // The caller is asking for a specific stored place id, not searching.
        // There is no city or postcode to corroborate and none is needed.
        agreement: 1,
      }

      const suggestion = toSuggestion(
        stub,
        { ...parsed, number: parsedId.number },
        { lat: match.lat, lng: match.lng },
        precisionOf(match)
      )

      return {
        ok: true,
        value: { ...suggestion, id, placeId: id, lat: match.lat, lng: match.lng, needsResolve: false },
      }
    },

    /**
     * What is at this point.
     *
     * The question the map asks when someone drags the pin, and until now the
     * one place the addresses still left the building: `MapView` drags the
     * HOME ADDRESS of a personal-injury client, and those coordinates went to
     * Geoapify. Answering it here is the last part of the privacy case for
     * building this at all.
     *
     * ── A correction that this replaces ──
     *
     * The comment that used to sit here said "the chain handles this:
     * `fallbackOnEmpty` is true, so a reverse lookup falls through to
     * Geoapify". It did not. `fallbackOnEmpty` is read only by
     * `autocompleteChain`, and `/api/geocode` called `provider.reverse`
     * directly, so switching to this provider made every pin drag answer `[]`
     * -- cached for a day, per coordinate. `reverseChain` now exists and does
     * what that comment claimed.
     *
     * ── What it may claim ──
     *
     * Every threshold below is measured by `scripts/geo/gate-reverse.ts` and
     * lives in `constants.ts` with the numbers behind it. The rule they enforce
     * is that THE LABEL AND THE PRECISION MUST AGREE: past `REVERSE_NUMBER_M`
     * the house number comes off the text entirely, because answering "you are
     * at 862" when the nearest recorded door is 120 m away is precisely the
     * confident wrong answer this engine exists to stop producing.
     *
     * `parcel` is deliberately never claimed. `isExactPrecision` treats it as
     * exact, and that predicate is what silences the "drag the pin" prompt --
     * on a browser geolocation, which can be blocks out, that would suppress
     * the warning exactly where it is most needed. `interpolated` is the honest
     * step: the prompt still fires and the word already means "placed by
     * inference". `parcel` would only be true if the registers published parcel
     * polygons, and they publish points.
     */
    async reverse(lat, lng): Promise<ProviderResult<GeocodeResult | null>> {
      // The escape hatch: reverse goes back to Geoapify and autocomplete is
      // untouched. One environment variable, no deploy, seconds.
      if (process.env.REVERSE_SELFHOSTED !== '1') return { ok: true, value: null }

      const streets = await store.nearby(lat, lng, REVERSE_SEARCH_RADIUS_DEG, REVERSE_CANDIDATES)
      // Nothing here at all, and not one blob fetched to find that out.
      if (streets.length === 0) return { ok: true, value: null }

      const payloads = await store.payloads(streets.map((s) => s.id))

      let best: { street: StreetRow; point: NearestPoint } | null = null
      for (const street of streets) {
        const payload = payloads.get(street.id)
        if (!payload) continue
        const point = nearestPoint(payload, lat, lng)
        if (!best || point.distanceM < best.point.distanceM) best = { street, point }
      }

      // No register within reach. Null rather than a guess, which lets the
      // chain hand the question to a provider that may know better -- open
      // water, farmland, and the counties that publish nothing at all.
      if (!best || best.point.distanceM > REVERSE_COVERAGE_M) return { ok: true, value: null }

      const near = best.point.distanceM <= REVERSE_NUMBER_M
      const precision: GeocodeSuggestion['precision'] =
        best.point.distanceM <= REVERSE_ROOFTOP_M ? 'rooftop' : near ? 'interpolated' : 'street'

      // Past NUMBER_M the number leaves the label, not just the precision.
      const parsed = parseUsAddress(
        near
          ? `${best.point.number} ${best.street.name_display}`
          : best.street.name_display
      )

      const stub: RankedStreet = {
        ...best.street,
        rank: 1,
        nameScore: 1,
        numberInRange: near,
        // The point came from this street's own blob, so there is nothing to
        // corroborate and nothing that could disagree.
        agreement: 1,
      }

      const suggestion = toSuggestion(
        stub,
        { ...parsed, number: near ? best.point.number : null },
        // The register's coordinate when we are claiming its door, and the
        // queried point when we are only naming the street: moving the pin the
        // user just placed, to a door we are not claiming they are at, would be
        // a worse answer than leaving it alone.
        near ? { lat: best.point.lat, lng: best.point.lng } : { lat, lng },
        precision
      )

      return {
        ok: true,
        value: {
          ...suggestion,
          lat: near ? best.point.lat : lat,
          lng: near ? best.point.lng : lng,
          needsResolve: false,
        },
      }
    },
  }
}

export const selfHostedProvider: GeocodeProvider = createSelfHostedProvider(supabaseStreetStore)
