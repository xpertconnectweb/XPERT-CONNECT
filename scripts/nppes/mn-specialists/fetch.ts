/**
 * Harvests every Minnesota specialist the client's list needs from NPPES.
 *
 *   npx tsx scripts/nppes/mn-specialists/fetch.ts [--refresh]
 *
 * The client asked (2026-09-24) for "una lista larga de clínicas especialistas
 * de todo Minnesota". This is the census behind that list: every organisation
 * (NPI-2) registered in MN under an injury-physician, chiropractic, physical
 * therapy or imaging taxonomy, plus the individuals (NPI-1) under the same
 * taxonomies, who are only used to count the providers at each location.
 *
 * Unlike `../fetch.ts`, which partitions by a guessed list of cities, this
 * partitions by ZIP prefix. `postal_code` takes a trailing wildcard, so
 * 550*…567* covers the state with nothing left to guess: any query that hits
 * the paging ceiling is split to four digits, then to five. A five-digit ZIP
 * that still saturates is the one place coverage is capped, and it is printed.
 *
 * Resumable. Every finished query is written to disk before the next starts —
 * a run that dies keeps everything it had.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { walk, type Address, type Enumeration, type Query, type RawRecord } from '../api'

/**
 * `taxonomy_description` matches a classification ("Chiropractor") or a
 * specialization ("Physical Therapy" finds "Clinic/Center, Physical Therapy").
 * Which codes are kept is decided in `build.ts`, by code, not here.
 */
const QUERIES: { taxonomy: string; enumerations: Enumeration[] }[] = [
  { taxonomy: 'Orthopaedic Surgery', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Neurological Surgery', enumerations: ['NPI-2', 'NPI-1'] },
  // Matches the Pain Medicine classification and the specializations under
  // Anesthesiology and PM&R.
  { taxonomy: 'Pain Medicine', enumerations: ['NPI-2', 'NPI-1'] },
  // "Clinic/Center, Pain" — pain clinics registered as a facility.
  { taxonomy: 'Pain', enumerations: ['NPI-2'] },
  { taxonomy: 'Physical Medicine & Rehabilitation', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Neurology', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Sports Medicine', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Chiropractor', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Physical Therapist', enumerations: ['NPI-2', 'NPI-1'] },
  // "Clinic/Center, Physical Therapy" — most PT clinics are registered this way.
  { taxonomy: 'Physical Therapy', enumerations: ['NPI-2'] },
  // The Radiology classification and "Clinic/Center, Radiology".
  { taxonomy: 'Radiology', enumerations: ['NPI-2', 'NPI-1'] },
  { taxonomy: 'Magnetic Resonance Imaging (MRI)', enumerations: ['NPI-2'] },
]

const STATE = 'MN'
/** Every three-digit ZIP prefix in Minnesota (55001–56763). */
const PREFIXES = Array.from({ length: 18 }, (_, i) => String(550 + i))

const OUT_DIR = join(process.cwd(), 'data', 'nppes', 'mn-specialists')
const RAW = join(OUT_DIR, 'raw.json')
const INDEX = join(OUT_DIR, '_index.json')

/** The fields `build.ts` reads. The full payload is ~3x larger. */
export interface NppesRecord {
  number: string
  enumeration_type: Enumeration
  basic: {
    organization_name?: string
    first_name?: string
    last_name?: string
    credential?: string
    status?: string
    organizational_subpart?: string
    parent_organization_legal_business_name?: string
    /** When the provider last touched its own record. Stale addresses live in old records. */
    last_updated?: string
    enumeration_date?: string
  }
  location: Address | null
  practiceLocations: Address[]
  otherNames: { type?: string; name: string }[]
  taxonomies: { code: string; desc: string; primary: boolean }[]
}

function trim(r: RawRecord): NppesRecord {
  const b = r.basic ?? {}
  return {
    number: r.number,
    enumeration_type: r.enumeration_type,
    basic: {
      organization_name: b.organization_name,
      first_name: b.first_name,
      last_name: b.last_name,
      credential: b.credential,
      status: b.status,
      organizational_subpart: b.organizational_subpart,
      parent_organization_legal_business_name: b.parent_organization_legal_business_name,
      last_updated: b.last_updated,
      enumeration_date: b.enumeration_date,
    },
    location: r.addresses?.find((a) => a.address_purpose === 'LOCATION') ?? null,
    practiceLocations: r.practiceLocations ?? [],
    otherNames: (r.other_names ?? [])
      .filter((o) => o.organization_name)
      .map((o) => ({ type: o.type, name: o.organization_name as string })),
    taxonomies: (r.taxonomies ?? []).map((t) => ({
      code: t.code,
      desc: t.desc,
      primary: Boolean(t.primary),
    })),
  }
}

const keyOf = (q: Query) => [q.taxonomy, q.enumeration, q.postalCode ?? '*'].join('|')

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh')
  mkdirSync(OUT_DIR, { recursive: true })

  const sink = new Map<string, NppesRecord>()
  let done: Record<string, { rows: number; saturated: boolean }> = {}
  if (!refresh && existsSync(RAW) && existsSync(INDEX)) {
    for (const r of JSON.parse(readFileSync(RAW, 'utf8')) as NppesRecord[]) sink.set(r.number, r)
    done = JSON.parse(readFileSync(INDEX, 'utf8')).done ?? {}
    console.log(`Resuming: ${sink.size} records, ${Object.keys(done).length} queries done.`)
  }

  const capped: string[] = []
  const save = () => {
    writeFileSync(RAW, JSON.stringify(Array.from(sink.values())))
    writeFileSync(INDEX, JSON.stringify({ done, records: sink.size, capped }, null, 2))
  }

  /** Runs one query, or recalls it, and reports whether it hit the ceiling. */
  const run = async (q: Query): Promise<boolean> => {
    const key = keyOf(q)
    const prior = done[key]
    if (prior) return prior.saturated
    const { rows, saturated } = await walk(q)
    for (const row of rows) if (!sink.has(row.number)) sink.set(row.number, trim(row))
    done[key] = { rows: rows.length, saturated }
    save()
    return saturated
  }

  /** Narrows a saturated partition one digit at a time, down to a full ZIP. */
  const split = async (base: Omit<Query, 'postalCode'>, prefix: string): Promise<void> => {
    const exact = prefix.length === 5
    const saturated = await run({ ...base, postalCode: exact ? prefix : `${prefix}*` })
    if (!saturated) return
    if (exact) {
      capped.push(`${base.taxonomy}|${base.enumeration}|${prefix}`)
      return
    }
    for (let d = 0; d <= 9; d++) await split(base, `${prefix}${d}`)
  }

  for (const { taxonomy, enumerations } of QUERIES) {
    for (const enumeration of enumerations) {
      const base = { taxonomy, state: STATE, enumeration }
      const before = sink.size
      if (await run(base)) {
        for (const prefix of PREFIXES) await split(base, prefix)
      }
      console.log(`  ${`${taxonomy} / ${enumeration}`.padEnd(48)} +${sink.size - before}`)
    }
  }
  save()

  const byType: Record<string, number> = {}
  let located = 0
  for (const r of Array.from(sink.values())) {
    byType[r.enumeration_type] = (byType[r.enumeration_type] ?? 0) + 1
    if (r.location?.state === STATE) located++
  }
  console.log(`\n${sink.size} records -> ${RAW}`)
  console.log(`  by type: ${JSON.stringify(byType)}; LOCATION in ${STATE}: ${located}`)
  console.log(`  queries run: ${Object.keys(done).length}`)
  if (capped.length) {
    console.log(`\n  ${capped.length} five-digit ZIPs still hit the ceiling (coverage capped there):`)
    for (const c of capped) console.log(`    ${c}`)
  } else {
    console.log('  No partition hit the ceiling: this is the full registry for these taxonomies.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
