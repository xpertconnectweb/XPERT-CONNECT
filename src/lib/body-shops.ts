import 'server-only'
import shops from '@/data/body-shops.json'
import type { BodyShopContact, BodyShopListing, BodyShopState } from '@/types/body-shops'
import { BODY_SHOP_STATES, INDEPENDENT, countyKey, isBodyShopState } from '@/lib/body-shop-meta'

/**
 * The Body Shops Directory's data.
 *
 * A static snapshot, `src/data/body-shops.json`, written by
 * `scripts/bodyshops/publish.ts` from the research pipeline: the 1,311
 * shops in Florida and Minnesota that were verified against a chain page,
 * the FDACS registry, the shop's own website or AASP-MN. Unlike the
 * lawyers, there is no table behind it. Nobody edits these rows from the
 * admin panel, so the data changes when the script runs again and the
 * site is deployed, and every read here is a read of memory.
 *
 * `server-only` is load-bearing. The file holds every shop's phone,
 * website and street address, which the public listing withholds; a
 * client component importing this module would ship all of them to the
 * browser and make the "Get information" form pointless.
 */

interface StoredShop {
  id: string
  name: string
  brand: string
  street: string
  city: string
  state: string
  zip: string
  county: string
  phone: string
  website: string
}

const STORED: readonly StoredShop[] = (shops as StoredShop[]).filter(
  (s) => isBodyShopState(s.state) && s.phone.trim() !== ''
)

const BY_ID: ReadonlyMap<string, StoredShop> = new Map(STORED.map((s) => [s.id, s]))

/** Built field by field: a field added to the JSON stays private until it is named here. */
function toListing(s: StoredShop): BodyShopListing {
  return {
    id: s.id,
    name: s.name,
    kind: s.brand || INDEPENDENT,
    city: s.city,
    county: s.county,
    state: s.state as BodyShopState,
    zipCode: s.zip,
  }
}

function toContact(s: StoredShop): BodyShopContact {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    website: s.website || undefined,
    address: [s.street, s.city, `${s.state} ${s.zip}`.trim()].filter(Boolean).join(', '),
  }
}

const LISTINGS: readonly BodyShopListing[] = STORED.map(toListing)

export function getBodyShopListings(): BodyShopListing[] {
  return [...LISTINGS]
}

/** One shop's listing and contact details, for the "Get information" form. */
export function getBodyShopById(
  id: string
): { listing: BodyShopListing; contact: BodyShopContact } | undefined {
  const shop = BY_ID.get(id)
  if (!shop) return undefined
  return { listing: toListing(shop), contact: toContact(shop) }
}

export interface BodyShopSummary {
  /** The rows rendered at rest, before the corpus is fetched. */
  showcase: BodyShopListing[]
  /** [kind, count]: independents first, then the chains, busiest first. */
  kinds: [string, number][]
  /** [state, count], in BODY_SHOP_STATES order. */
  states: [BodyShopState, number][]
  /** `countyKey`s, sorted by state then county. */
  counties: string[]
  total: number
}

/**
 * A stable shuffle key. The showcase must be the same on every render
 * (a random pick would differ between server and client and make every
 * screenshot different), but ordering by id would show nine shops from
 * the lowest ZIP codes in Florida.
 */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Pick the rows to show at rest.
 *
 * Independents alternate with chains, because six in ten shops are
 * independent and a sample of nine chain locations would misdescribe the
 * directory. The states alternate two to one, roughly their share.
 * Within that, each pick prefers a city not yet shown.
 */
export function pickBodyShopShowcase(
  listings: readonly BodyShopListing[],
  chains: readonly string[],
  n: number
): BodyShopListing[] {
  const ordered = [...listings].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id))
  const chosen: BodyShopListing[] = []
  const taken = new Set<string>()
  const seenCity = new Set<string>()
  const statePattern: BodyShopState[] = ['FL', 'MN', 'FL']
  let chainAt = 0

  for (let slot = 0; chosen.length < n && slot < n * 4; slot++) {
    const wantChain = slot % 2 === 1 && chains.length > 0
    const kind = wantChain ? chains[chainAt++ % chains.length] : INDEPENDENT
    const state = statePattern[slot % statePattern.length]
    const fits = (s: BodyShopListing, sameState: boolean, newCity: boolean) =>
      !taken.has(s.id) &&
      s.kind === kind &&
      (!sameState || s.state === state) &&
      (!newCity || !seenCity.has(`${s.state}|${s.city}`))
    const pick =
      ordered.find((s) => fits(s, true, true)) ??
      ordered.find((s) => fits(s, false, true)) ??
      ordered.find((s) => fits(s, false, false))
    if (!pick) continue
    chosen.push(pick)
    taken.add(pick.id)
    seenCity.add(`${pick.state}|${pick.city}`)
  }

  for (const s of ordered) {
    if (chosen.length >= n) break
    if (!taken.has(s.id)) {
      chosen.push(s)
      taken.add(s.id)
    }
  }
  return chosen
}

export function getBodyShopSummary(showcaseSize = 9): BodyShopSummary {
  const kindCounts = new Map<string, number>()
  const stateCounts = new Map<BodyShopState, number>()
  const counties = new Set<string>()
  for (const s of LISTINGS) {
    kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1)
    stateCounts.set(s.state, (stateCounts.get(s.state) ?? 0) + 1)
    if (s.county) counties.add(countyKey(s.state, s.county))
  }

  const chains = Array.from(kindCounts.keys())
    .filter((k) => k !== INDEPENDENT)
    .sort((a, b) => (kindCounts.get(b) ?? 0) - (kindCounts.get(a) ?? 0) || a.localeCompare(b))
  const kinds: [string, number][] = [
    ...(kindCounts.has(INDEPENDENT) ? [[INDEPENDENT, kindCounts.get(INDEPENDENT)!] as [string, number]] : []),
    ...chains.map((k) => [k, kindCounts.get(k) ?? 0] as [string, number]),
  ]

  return {
    showcase: pickBodyShopShowcase(LISTINGS, chains, showcaseSize),
    kinds,
    states: BODY_SHOP_STATES.filter((st) => stateCounts.has(st)).map(
      (st) => [st, stateCounts.get(st) ?? 0] as [BodyShopState, number]
    ),
    counties: Array.from(counties).sort(),
    total: LISTINGS.length,
  }
}
