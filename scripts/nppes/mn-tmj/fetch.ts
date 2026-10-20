/**
 * Harvests every Minnesota TMJ specialist the registry can name.
 *
 *   npx tsx scripts/nppes/mn-tmj/fetch.ts [--refresh]
 *
 * The client asked (2026-10-19) whether we had TMJ specialists in Minnesota.
 * We did not: the September list (`../mn-specialists/`) covered injury
 * physicians, chiropractic, PT and imaging, and TMJ lives in dentistry. This
 * is the same census for TMJ:
 *
 * - **Orofacial Pain** (`1223X2210X`), the dental specialty that is TMJ
 *   disorders. Individuals too, because there are only a couple of dozen and
 *   each one is the specialist the list exists to find.
 * - **Oral and Maxillofacial Surgery** — the surgeons who operate on the joint.
 *   Individuals are fetched only to find the practice they work at.
 * - **Every dental organisation in the state**, to search their names (and
 *   DBAs) for "TMJ", "TMD", "Facial Pain" and the like, and to find the clinic
 *   an individual specialist works at. The API matches names by prefix only,
 *   so a name search alone would miss "Twin Cities TMJ".
 * - **Name prefixes** across every taxonomy, for a TMJ clinic registered as
 *   something other than dental ("Clinic/Center", "Specialist").
 *
 * Partitioned by ZIP prefix exactly like the September fetch. Resumable.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { walk, type Enumeration, type Query, type RawRecord } from '../api'
import type { NppesRecord } from '../mn-specialists/fetch'

const QUERIES: { taxonomy?: string; name?: string; enumerations: Enumeration[] }[] = [
  { taxonomy: 'Orofacial Pain', enumerations: ['NPI-2', 'NPI-1'] },
  // Matches the dentist specialization (1223S0112X), the physician one
  // (204E00000X) and "Clinic/Center, Oral and Maxillofacial Surgery".
  { taxonomy: 'Oral and Maxillofacial Surgery', enumerations: ['NPI-2', 'NPI-1'] },
  // Every "Dentist, *" organisation: general practice, prosthodontics, ...
  { taxonomy: 'Dentist', enumerations: ['NPI-2'] },
  // "Clinic/Center, Dental", which is how most group practices register.
  { taxonomy: 'Dental', enumerations: ['NPI-2'] },
  ...['TMJ*', 'TMD*', 'OROFACIAL*', 'CRANIOFACIAL*', 'FACIAL PAIN*', 'HEAD AND NECK*', 'HEAD & NECK*', 'MINNESOTA HEAD*', 'JAW*'].map(
    (name) => ({ name, enumerations: ['NPI-2'] as Enumeration[] })
  ),
]

const STATE = 'MN'
/** Every three-digit ZIP prefix in Minnesota (55001–56763). */
const PREFIXES = Array.from({ length: 18 }, (_, i) => String(550 + i))

const OUT_DIR = join(process.cwd(), 'data', 'nppes', 'mn-tmj')
const RAW = join(OUT_DIR, 'raw.json')
const INDEX = join(OUT_DIR, '_index.json')

/** Same shape as the September harvest, so the two can be read together. */
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

const keyOf = (q: Query) =>
  [q.taxonomy || `name:${q.organizationName}`, q.enumeration, q.postalCode ?? '*'].join('|')

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh')
  mkdirSync(OUT_DIR, { recursive: true })

  const sink = new Map<string, NppesRecord>()
  /** Which query found each NPI first: the report says where each row came from. */
  let foundBy: Record<string, string> = {}
  let done: Record<string, { rows: number; saturated: boolean }> = {}
  if (!refresh && existsSync(RAW) && existsSync(INDEX)) {
    for (const r of JSON.parse(readFileSync(RAW, 'utf8')) as NppesRecord[]) sink.set(r.number, r)
    const index = JSON.parse(readFileSync(INDEX, 'utf8'))
    done = index.done ?? {}
    foundBy = index.foundBy ?? {}
    console.log(`Resuming: ${sink.size} records, ${Object.keys(done).length} queries done.`)
  }

  const capped: string[] = []
  const save = () => {
    writeFileSync(RAW, JSON.stringify(Array.from(sink.values())))
    writeFileSync(INDEX, JSON.stringify({ done, records: sink.size, capped, foundBy }, null, 2))
  }

  const run = async (q: Query): Promise<boolean> => {
    const key = keyOf(q)
    const prior = done[key]
    if (prior) return prior.saturated
    const { rows, saturated } = await walk(q)
    for (const row of rows) {
      if (sink.has(row.number)) continue
      sink.set(row.number, trim(row))
      foundBy[row.number] = q.taxonomy || `name:${q.organizationName}`
    }
    done[key] = { rows: rows.length, saturated }
    save()
    return saturated
  }

  const split = async (base: Omit<Query, 'postalCode'>, prefix: string): Promise<void> => {
    const exact = prefix.length === 5
    const saturated = await run({ ...base, postalCode: exact ? prefix : `${prefix}*` })
    if (!saturated) return
    if (exact) {
      capped.push(`${keyOf(base as Query)}|${prefix}`)
      return
    }
    for (let d = 0; d <= 9; d++) await split(base, `${prefix}${d}`)
  }

  for (const { taxonomy, name, enumerations } of QUERIES) {
    for (const enumeration of enumerations) {
      const base: Query = { taxonomy: taxonomy ?? '', organizationName: name, state: STATE, enumeration }
      const before = sink.size
      if (await run(base)) {
        for (const prefix of PREFIXES) await split(base, prefix)
      }
      console.log(`  ${`${taxonomy ?? `name ${name}`} / ${enumeration}`.padEnd(48)} +${sink.size - before}`)
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
    console.log('  No partition hit the ceiling: this is the full registry for these queries.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
