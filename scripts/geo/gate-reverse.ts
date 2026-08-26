/**
 * What may an in-house reverse geocode claim, and from how far away?
 *
 *   node --max-old-space-size=4096 node_modules/tsx/dist/cli.mjs \
 *     scripts/geo/gate-reverse.ts
 *   ... --trials=20000 --limit=12
 *
 * Reverse geocoding is the question the map asks when someone drags the pin:
 * not "where is this address" but "what is at this point". Today that question
 * leaves the building -- the coordinates of a personal-injury client's home go
 * to Geoapify -- and closing that is the whole point of Phase C.
 *
 * -- The experiment ----------------------------------------------------------
 *
 * Take a door the county recorded, move it delta metres in some direction, and
 * ask the engine what is there. If it answers with the door we started from,
 * a reverse geocode from delta metres away can honestly name that house. The
 * largest delta that still works is `ROOFTOP_M`, and it is a property of the
 * DATA -- of how far apart the doors are -- not of anyone's judgement.
 *
 * Stratified by local density rather than by county. Density is the variable
 * that actually drives the answer: a threshold that holds on a Minneapolis
 * block where doors are 10 m apart is a fantasy on a county road where they are
 * 400 m apart, and both of those exist inside single counties. This also means
 * the gate does not depend on a county label that `merged.ndjson` no longer
 * carries.
 *
 * Nothing here touches the database. It runs against `LocalIndex`, whose
 * `nearby` is the same algorithm `geo_street_nearby` implements over the same
 * cell scheme -- which is why that mirror is not optional. Step 6 of the plan
 * re-runs this against the real database and the two must agree; if they do
 * not, the SQL and the mirror have drifted and the numbers below are fiction.
 */
import { LocalIndex } from './lib/local-index'
import { decodePoints, nearestPoint } from '../../src/lib/geocoding/payload-codec'
import { REVERSE_CELL_DEGREES } from '../../src/lib/geocoding/constants'
import { haversineDistance } from '../../src/lib/map/geo'

const METRES_PER_MILE = 1609.344
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

/** The displacements to try, in metres. */
const DELTAS = [2, 5, 10, 15, 25, 40, 60, 100, 150, 250, 400, 700, 1000]

/**
 * How many candidate streets the lookup pulls before scoring.
 *
 * Twelve, matching what the provider will ask for. Measuring with a different
 * number than production uses would measure a different system.
 */
const DEFAULT_LIMIT = 12

/** How far the cell read reaches, in degrees of latitude. Three cells. */
const SEARCH_RADIUS_DEG = REVERSE_CELL_DEGREES * 3

interface Probe {
  lat: number
  lng: number
  number: number
  /**
   * Recorded doors within 100 m, across EVERY nearby street. The stratifying
   * variable, and counting only the probe's own street was wrong: a three-door
   * cul-de-sac in downtown Minneapolis came out classified as sparse, which is
   * the opposite of what the word is being used to mean here.
   */
  density: number
}

/** Deterministic, so two runs of this gate are comparable. */
function angleFor(i: number): number {
  // Golden-angle stepping: successive probes point in maximally different
  // directions rather than clustering, without a random number generator whose
  // seed would have to be reported for the run to mean anything.
  return (i * 2.399963229728653) % (Math.PI * 2)
}

function displace(lat: number, lng: number, metres: number, angle: number) {
  const dLat = (metres * Math.cos(angle)) / 111_320
  const dLng = (metres * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

/**
 * The engine's reverse answer: the nearest recorded door across every candidate
 * street the cell lookup returned.
 */
function reverseAt(index: LocalIndex, lat: number, lng: number, limit: number) {
  const candidates = index.nearby(lat, lng, SEARCH_RADIUS_DEG, limit)

  let best: { number: number; lat: number; lng: number; distanceM: number } | null = null
  for (const street of candidates) {
    const hit = nearestPoint(street.payload, lat, lng)
    if (!best || hit.distanceM < best.distanceM) best = hit
  }
  return best
}

async function main() {
  const trials = Number(arg('trials') ?? 20_000)
  const limit = Number(arg('limit') ?? DEFAULT_LIMIT)

  process.stdout.write('  loading the index… ')
  const index = await LocalIndex.load()
  console.log(`${index.size.toLocaleString('en-US')} streets`)

  // Probes spread across the whole index rather than taken from the front of
  // it, which would be one state and a handful of counties.
  process.stdout.write('  choosing probes… ')
  const probes: Probe[] = []
  const stride = Math.max(1, Math.floor(index.size / trials))
  for (let at = 0; at < index.size && probes.length < trials; at += stride) {
    const payload = index.payloadOf(at)
    if (!payload) continue
    const points = decodePoints(payload)
    const p = points[points.length >> 1]

    let density = 0
    for (const street of index.nearby(p.lat, p.lng, SEARCH_RADIUS_DEG, 24)) {
      for (const q of decodePoints(street.payload)) {
        if (haversineDistance(p.lat, p.lng, q.lat, q.lng) * METRES_PER_MILE <= 100) density++
      }
    }
    probes.push({ lat: p.lat, lng: p.lng, number: p.number, density })
  }
  console.log(`${probes.length.toLocaleString('en-US')}`)

  // Terciles of the density distribution, so the strata are defined by the data
  // rather than by round numbers picked to look tidy.
  const sortedDensity = probes.map((p) => p.density).sort((a, b) => a - b)
  const cutLow = sortedDensity[Math.floor(sortedDensity.length / 3)]
  const cutHigh = sortedDensity[Math.floor((2 * sortedDensity.length) / 3)]
  const stratumOf = (p: Probe) =>
    p.density <= cutLow ? 'sparse' : p.density <= cutHigh ? 'middling' : 'dense'

  const STRATA = ['sparse', 'middling', 'dense'] as const
  console.log(
    `\n  Strata by doors within 100 m:  sparse <= ${cutLow}` +
      `   middling <= ${cutHigh}   dense above\n`
  )

  // How far the nearest street is from an arbitrary point, which is what sizes
  // the radius at which the engine should give up and let Geoapify try.
  const nearestStreet: number[] = []

  /**
   * Two tallies per (stratum, displacement), and the second matters more.
   *
   * `hit` is how often the engine names the exact door we started from. But a
   * miss is not one thing: naming the house next door when the pin moved 25 m
   * is the register's own resolution talking, while naming a street two blocks
   * away is the engine being wrong. `strayM` keeps the distance from the named
   * door back to the true one, so the two failures can be told apart -- and it
   * is what decides how much the label may claim.
   */
  const recovered = new Map<string, { hit: number; total: number; strayM: number[] }>()
  const key = (s: string, d: number) => `${s}|${d}`

  let done = 0
  for (let i = 0; i < probes.length; i++) {
    const probe = probes[i]
    const stratum = stratumOf(probe)

    for (const delta of DELTAS) {
      const from = displace(probe.lat, probe.lng, delta, angleFor(i))
      const answer = reverseAt(index, from.lat, from.lng, limit)

      const k = key(stratum, delta)
      const tally = recovered.get(k) ?? { hit: 0, total: 0, strayM: [] }
      tally.total++
      if (answer) {
        const stray =
          haversineDistance(answer.lat, answer.lng, probe.lat, probe.lng) * METRES_PER_MILE
        // The same door, to within the codec's 1.1 m quantisation.
        if (answer.number === probe.number && stray < 2) tally.hit++
        tally.strayM.push(stray)
      }
      recovered.set(k, tally)

      // Measured at the WIDEST displacement, where "how far is the nearest
      // recorded door" is a real question. Taking it at the narrowest asked how
      // far a door is from two metres away, and unsurprisingly answered two.
      if (delta === DELTAS[DELTAS.length - 1] && answer) nearestStreet.push(answer.distanceM)
    }

    if (++done % 2000 === 0) process.stdout.write(`  ${done}/${probes.length}\r`)
  }

  console.log(`${' '.repeat(40)}\r`)

  const p95 = (xs: number[]) => {
    if (xs.length === 0) return NaN
    const s = xs.slice().sort((a, b) => a - b)
    return s[Math.floor(0.95 * s.length)]
  }

  console.log('  Reverse lookup from N metres away: names the exact door / how far it strays\n')
  console.log(`  ${'from'.padStart(7)}   ${STRATA.map((s) => s.padStart(20)).join('')}`)

  /**
   * The bar for `rooftop`, in metres of stray.
   *
   * Deliberately NOT "names the exact door". That criterion looked right and
   * broke on the data: even a two-metre displacement recovers the exact door
   * only 94.7% of the time, because the registers publish co-located records --
   * the two halves of a duplex, a parcel exported twice -- that sit a metre or
   * so apart. Losing the coin toss between two doors one metre apart is not an
   * error any user could observe, and a threshold derived from it would be 0.
   *
   * A building is 10-20 m across, so a named door within 10 m is the building
   * the pin is on, or its immediate neighbour. That is what `rooftop` claims.
   */
  const ROOFTOP_STRAY_M = 10

  /** The largest displacement whose named door is still the right building. */
  let rooftop = 0
  let roofBroken = false
  /** The largest displacement whose stray stays inside the 50 m bar everywhere. */
  let number = 0
  let blockBroken = false

  for (const delta of DELTAS) {
    const rates = STRATA.map((s) => {
      const t = recovered.get(key(s, delta))
      return t && t.total ? (t.hit / t.total) * 100 : NaN
    })
    const strays = STRATA.map((s) => p95(recovered.get(key(s, delta))?.strayM ?? []))

    if (strays.every((m) => m <= ROOFTOP_STRAY_M) && !roofBroken) rooftop = delta
    else roofBroken = true

    if (strays.every((m) => m <= 50) && !blockBroken) number = delta
    else blockBroken = true

    console.log(
      `  ${`${delta} m`.padStart(7)}   ` +
        STRATA.map(
          (_, i) => `${rates[i].toFixed(1)}%  p95 ${strays[i].toFixed(0)}m`.padStart(20)
        ).join('')
    )
  }

  nearestStreet.sort((a, b) => a - b)
  const pct = (p: number) => nearestStreet[Math.floor((p / 100) * nearestStreet.length)]

  console.log(`\n${'-'.repeat(64)}`)
  console.log('  Proposed thresholds, each with the line above behind it:\n')
  console.log(
    `    ROOFTOP_M ............. ${rooftop} m` +
      `\n${' '.repeat(28)}the widest displacement whose named door is still within` +
      `\n${' '.repeat(28)}${ROOFTOP_STRAY_M} m of the true one in every stratum -- the right` +
      `\n${' '.repeat(28)}building, or its immediate neighbour. Not "the exact door":` +
      `\n${' '.repeat(28)}the registers publish co-located records a metre apart, so` +
      `\n${' '.repeat(28)}that criterion never clears 95% at any displacement and` +
      `\n${' '.repeat(28)}would set this to zero over a coin toss nobody can observe.`
  )
  console.log(
    `\n    NUMBER_M .............. ${number} m` +
      `\n${' '.repeat(28)}the widest displacement whose named door still lands` +
      `\n${' '.repeat(28)}within the 50 m this project calls the right building.` +
      `\n${' '.repeat(28)}Past this the house number comes off the label and only` +
      `\n${' '.repeat(28)}the street is claimed.`
  )
  console.log(
    `\n  Distance from an arbitrary point to the nearest recorded door:\n` +
      `    p50 ${pct(50).toFixed(1)} m   p90 ${pct(90).toFixed(1)} m   ` +
      `p99 ${pct(99).toFixed(1)} m   max ${nearestStreet[nearestStreet.length - 1].toFixed(0)} m\n`
  )
  console.log(
    `  A bar set on the dense stratum alone would be ` +
      `${DELTAS.filter((d) => {
        const t = recovered.get(key('dense', d))
        return t && t.total && t.hit / t.total >= 0.95
      }).pop() ?? 0} m -- which is the number to resist.\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
