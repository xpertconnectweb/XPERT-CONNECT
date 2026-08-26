/**
 * Types addresses at a running instance the way a person would, and reports
 * what comes back.
 *
 * The unit tests check the parts, the benchmark checks accuracy against county
 * registers, and the E2E suite checks the interface. None of them answers the
 * question a user actually has: I typed this, was the answer any good?
 *
 *   npx tsx scripts/geo/probe.ts                              # against production
 *   npx tsx scripts/geo/probe.ts --base=http://localhost:3000
 *   npx tsx scripts/geo/probe.ts --only=typos
 *
 * ── Authentication ──────────────────────────────────────────────────────────
 *
 * `/api/geocode` requires a session, deliberately: the addresses it resolves are
 * personal-injury clients' home addresses and the endpoint is not public. This
 * reuses the cookie the E2E setup writes to `.auth/lawyer.json`, so no separate
 * credential exists anywhere. Run the E2E suite once first if that file is
 * missing or its session has expired:
 *
 *   E2E_BASE_URL=<base> npx dotenv -e .env.test -- npx playwright test --project=setup
 */
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { haversineDistance } from '../../src/lib/map/geo'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const BASE = (arg('base') ?? 'https://www.844xpert.com').replace(/\/$/, '')
const ONLY = arg('only')
const METRES_PER_MILE = 1609.344

interface Suggestion {
  label: string
  fullLabel: string
  precision: string
  providerId: string
  lat: number | null
  lng: number | null
  needsResolve: boolean
}

/**
 * What a scenario is checking.
 *
 * `truth` is the county register's own coordinate where one is known, so the
 * answer can be scored rather than merely read.
 */
interface Scenario {
  group: string
  query: string
  /** What a reasonable person would call a good answer. */
  want: string
  truth?: { lat: number; lng: number }
}

const SCENARIOS: Scenario[] = [
  // ── The complaint ─────────────────────────────────────────────────────────
  {
    group: 'reported',
    query: '862 62nd St Cir E, Bradenton, Florida',
    want: 'rooftop, on the building',
    truth: { lat: 27.491257, lng: -82.481824 },
  },
  {
    group: 'reported',
    query: '862 62nd Street Circle East, Bradenton, FL 34208',
    want: 'same answer, written out in full',
    truth: { lat: 27.491257, lng: -82.481824 },
  },

  // ── As you type ───────────────────────────────────────────────────────────
  // Autocomplete is the interactive path and the one that has to stay useful
  // while the query is still half-finished.
  { group: 'typing', query: '862 62nd', want: 'something plausible, or nothing' },
  { group: 'typing', query: '862 62nd St Cir', want: 'the street, before the city is typed' },
  { group: 'typing', query: '862 62nd St Cir E, Brad', want: 'narrowing as the city arrives' },
  { group: 'typing', query: '86', want: 'nothing — below the minimum query length' },

  // ── Typos ─────────────────────────────────────────────────────────────────
  // The entire reason for a trigram index. A referral clerk typing an address
  // off a phone call gets one shot at spelling it.
  { group: 'typos', query: '862 62nd St Cirle E, Bradenton, FL 34208', want: 'survives a missing letter' },
  { group: 'typos', query: '862 62nd St Cir E, Bradentn, FL 34208', want: 'survives a typo in the city' },
  { group: 'typos', query: '1531 SE 17th Stret, Ocala, FL 34471', want: 'survives a typo in the suffix' },

  // ── Missing pieces ────────────────────────────────────────────────────────
  { group: 'partial', query: '862 62nd St Cir E, Bradenton FL', want: 'no postcode' },
  { group: 'partial', query: '862 62nd St Cir E, FL', want: 'no city either' },
  { group: 'partial', query: '62nd St Cir E, Bradenton, FL 34208', want: 'street with no house number' },

  // ── Units ─────────────────────────────────────────────────────────────────
  // Registers do not hold flat numbers, so the unit has to be lifted off before
  // the lookup and must not drag the street with it.
  { group: 'units', query: '1531 SE 17th St Unit 101/102, Ocala, FL 34471', want: 'the double unit case' },
  { group: 'units', query: '2500 Harbor Blvd, Ste 105, Punta Gorda, FL 33950', want: 'a suite' },
  { group: 'units', query: '6290 Berryhill Rd Apt 3J, Milton, FL 32570', want: 'a flat the county glued into the street name' },
  { group: 'units', query: '1000 Legion Pl #200, Orlando, FL 32801', want: 'a hash unit' },

  // ── Minnesota ─────────────────────────────────────────────────────────────
  // The other state this platform serves, and the one nobody remembers to test.
  { group: 'minnesota', query: '2100 Blaisdell Ave, Minneapolis, MN 55404', want: 'a Minneapolis address' },
  { group: 'minnesota', query: '1250 Grand Ave, Saint Paul, MN 55105', want: 'a Saint Paul address' },
  { group: 'minnesota', query: '900 Johnson St, Madison, MN 56256', want: 'rural Minnesota' },

  // ── Directionals and abbreviations ────────────────────────────────────────
  { group: 'spelling', query: '1531 Southeast 17th Street, Ocala, FL 34471', want: 'directional spelled out' },
  { group: 'spelling', query: '100 N.E. 2nd St., Miami, FL 33132', want: 'full stops in the abbreviation' },
  { group: 'spelling', query: '862 62nd St Cir Este, Bradenton, FL 34208', want: 'a Spanish directional' },

  // ── Rural and highways ────────────────────────────────────────────────────
  { group: 'rural', query: '35410 Sr 64 E, Myakka City, FL 34251', want: 'a state road' },
  { group: 'rural', query: '25503 N State Rd 121, Alachua, FL 32615', want: 'the one Geoapify put 14.6 km out' },

  // ── Things that are not postal addresses ──────────────────────────────────
  // Out of scope for the self-hosted engine on purpose. The requirement is that
  // the fallback picks them up, not that this engine answers them.
  { group: 'outofscope', query: '1200 Market St, Philadelphia, PA 19107', want: 'another state — Geoapify' },
  { group: 'outofscope', query: 'Bayfront Health, Punta Gorda, FL', want: 'a business by name — Geoapify' },
  { group: 'outofscope', query: '34208', want: 'a bare postcode' },
  { group: 'outofscope', query: 'Bradenton, FL', want: 'a city' },

  // ── Should not invent anything ────────────────────────────────────────────
  { group: 'absent', query: '9999999 Nowhere Rd, Bradenton, FL 34208', want: 'no such street' },
  { group: 'absent', query: '5599 N Stillman St, Pensacola, FL 32505', want: 'real street, number outside the block' },
  { group: 'absent', query: 'PO Box 1234, Bradenton, FL 34208', want: 'a post box is not a place' },
]

async function main() {
  const state = await readFile('.auth/lawyer.json', 'utf8').catch(() => null)
  if (!state) {
    console.error('\n  No .auth/lawyer.json — run the E2E setup project first. See the header of this file.\n')
    process.exit(1)
  }

  const cookies = (JSON.parse(state) as { cookies: Array<{ name: string; value: string }> }).cookies
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  // One session id for the whole run, as one person searching would have.
  const sid = randomUUID()
  const scenarios = ONLY ? SCENARIOS.filter((s) => s.group === ONLY) : SCENARIOS

  console.log(`\n  ${BASE}   ${scenarios.length} scenarios\n`)

  let group = ''
  const byProvider = new Map<string, number>()
  const byPrecision = new Map<string, number>()

  for (const scenario of scenarios) {
    if (scenario.group !== group) {
      group = scenario.group
      console.log(`  ${'─'.repeat(72)}`)
    }

    const started = Date.now()
    const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(scenario.query)}&sid=${sid}`, {
      headers: { cookie, accept: 'application/json' },
    })
    const ms = Date.now() - started
    const body = (await res.json()) as Suggestion[] | { error: string }

    console.log(`  ${scenario.query}`)
    console.log(`      want: ${scenario.want}`)

    if (!Array.isArray(body)) {
      console.log(`      HTTP ${res.status}  ${body.error}\n`)
      continue
    }
    if (body.length === 0) {
      console.log(`      → nothing  (${ms} ms)\n`)
      continue
    }

    const best = body[0]
    byProvider.set(best.providerId, (byProvider.get(best.providerId) ?? 0) + 1)
    byPrecision.set(best.precision, (byPrecision.get(best.precision) ?? 0) + 1)

    const off =
      scenario.truth && best.lat !== null && best.lng !== null
        ? `   ${(haversineDistance(scenario.truth.lat, scenario.truth.lng, best.lat, best.lng) * METRES_PER_MILE).toFixed(1)} m off`
        : ''

    console.log(
      `      → ${best.fullLabel}` +
        `\n        ${best.precision.padEnd(13)} ${best.providerId.padEnd(11)} ` +
        `${body.length} result${body.length === 1 ? '' : 's'}   ${ms} ms${off}`
    )
    if (body.length > 1) console.log(`        next: ${body[1].fullLabel}`)
    console.log('')
  }

  console.log(`  ${'─'.repeat(72)}`)
  const tally = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')
  console.log(`  answered by: ${tally(byProvider)}`)
  console.log(`  precision:   ${tally(byPrecision)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
