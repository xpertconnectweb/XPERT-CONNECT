/**
 * Run the same addresses through every configured provider and print a hit
 * table.
 *
 * This exists because the provider question should be settled with evidence
 * rather than with marketing copy. The client reported one address that does
 * not resolve; the useful question is how many of THEIR addresses do not, and
 * which provider fixes the most of them for the least money.
 *
 * Nominatim needs no key and runs today. Mapbox and Google join the comparison
 * automatically as soon as `MAPBOX_ACCESS_TOKEN` or `GOOGLE_MAPS_SERVER_KEY`
 * is present — trial keys are enough, and nothing here writes anything.
 *
 *   npx tsx scripts/geocode-bakeoff.ts
 *   npx tsx scripts/geocode-bakeoff.ts --sample=30
 *   npx tsx scripts/geocode-bakeoff.ts --file=addresses.txt
 *
 * `--sample=N` draws N real addresses from `clinics` alongside the fixed list
 * below, so the comparison reflects the corpus rather than a handful of cases
 * someone chose.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { geoapifyProvider } from '../src/lib/geocoding/geoapify'
import { googleProvider } from '../src/lib/geocoding/google'
import { mapboxProvider } from '../src/lib/geocoding/mapbox'
import { nominatimProvider } from '../src/lib/geocoding/nominatim'
import type { GeocodeProvider } from '../src/lib/geocoding/types'
import { isExactPrecision } from '../src/lib/geocoding/precision'

config({ path: '.env.local' })
config()

const SAMPLE = Number(process.argv.find((a) => a.startsWith('--sample='))?.split('=')[1]) || 0
const FILE = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1]

/**
 * The reported case, first, plus a spread of shapes that have broken before.
 *
 * "862 62nd St Cir E" is the address the client raised. Verified by hand
 * against Nominatim: the raw query, the USPS-expanded query, the street alone
 * and the query with the ZIP appended all return an empty array, because the
 * street is not in OpenStreetMap at all.
 */
const FIXED_CASES = [
  '862 62nd St Cir E, Bradenton, FL',
  '862 62nd Street Circle East, Bradenton, FL 34208',
  '3200 SW 34th St, Gainesville, FL 32608',
  '1117 N Palafox St, Pensacola, FL 32501',
  '123 Main St Apt 4B, Orlando, FL 32801',
  '32801',
  'Bradenton, FL',
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Outcome {
  found: boolean
  precision: string
  label: string
}

async function ask(provider: GeocodeProvider, address: string): Promise<Outcome> {
  // Nominatim's published policy is one request per second. The paid providers
  // have no such limit, and pacing them would make a 30-address run take a
  // pointless three minutes.
  await sleep(provider.id === 'nominatim' ? 1100 : 100)

  const result = await provider.autocomplete(address, { limit: 1 })
  if (!result.ok) return { found: false, precision: result.kind, label: '' }

  const first = result.value[0]
  if (!first) return { found: false, precision: '—', label: '' }

  // Google and Mapbox withhold geometry until the resolve step, so a suggestion
  // alone does not prove the address is locatable. Resolving is what makes the
  // comparison honest — and it is also the call that costs money, which is the
  // number the cost model should be built on.
  if (first.needsResolve) {
    const details = await provider.details(first.id, { limit: 1 })
    if (!details.ok || !details.value) {
      return { found: false, precision: 'unresolved', label: first.label }
    }
    return {
      found: true,
      precision: details.value.precision,
      label: details.value.fullLabel || details.value.label,
    }
  }

  return { found: true, precision: first.precision, label: first.fullLabel || first.label }
}

async function collectAddresses(): Promise<string[]> {
  if (FILE) {
    return readFileSync(FILE, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (!SAMPLE) return FIXED_CASES

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('No Supabase credentials; using the fixed cases only.')
    return FIXED_CASES
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await supabase.from('clinics').select('address').limit(SAMPLE)
  const sampled = (data ?? []).map((row) => row.address as string).filter(Boolean)
  return [...FIXED_CASES, ...sampled]
}

async function main() {
  const candidates: GeocodeProvider[] = [
    nominatimProvider,
    geoapifyProvider,
    mapboxProvider,
    googleProvider,
  ]
  const providers = candidates.filter((p) => p.configured())

  console.log(`providers: ${providers.map((p) => p.id).join(', ')}`)
  for (const skipped of candidates.filter((p) => !p.configured())) {
    console.log(`  (${skipped.id} skipped — no API key set)`)
  }

  const addresses = await collectAddresses()
  console.log(`addresses: ${addresses.length}\n`)

  const score = new Map<string, { found: number; exact: number }>()
  for (const provider of providers) score.set(provider.id, { found: 0, exact: 0 })

  for (const address of addresses) {
    console.log(address)
    for (const provider of providers) {
      const outcome = await ask(provider, address)
      const tally = score.get(provider.id)!
      if (outcome.found) {
        tally.found += 1
        if (isExactPrecision(outcome.precision as never)) tally.exact += 1
      }
      const mark = outcome.found ? (isExactPrecision(outcome.precision as never) ? '✓' : '~') : '✗'
      console.log(
        `  ${mark} ${provider.id.padEnd(10)} ${outcome.precision.padEnd(13)} ${outcome.label}`
      )
    }
    console.log('')
  }

  console.log('─'.repeat(60))
  console.log(`${'provider'.padEnd(12)} ${'found'.padEnd(12)} rooftop or parcel`)
  for (const provider of providers) {
    const tally = score.get(provider.id)!
    const pct = (n: number) => `${n}/${addresses.length} (${Math.round((n / addresses.length) * 100)}%)`
    console.log(`${provider.id.padEnd(12)} ${pct(tally.found).padEnd(12)} ${pct(tally.exact)}`)
  }
  console.log(
    '\n"found" is what stops the search box failing. "rooftop or parcel" is\n' +
      'what makes the distance to the nearest clinic mean anything.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
