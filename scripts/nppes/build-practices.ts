/**
 * Turns the NPPES harvest into rows this directory can actually use.
 *
 * Clusters providers by practice address, throws out everything that is not a
 * real consulting room, names what is left, tags it against the existing
 * specialty catalog, and splits the result into rows to insert and tags to
 * merge into clinics that are already here.
 *
 * Writes nothing to the database. Its output is four files and a report, and
 * the report is the point: it says how many of each thing were dropped and
 * why, so the decision to load can be made by looking rather than by trusting.
 *
 * Two rules worth stating out loud, because both are easy to break later:
 *
 *   - A practice that is already in the directory is MERGED, not inserted.
 *     `clinics` has no unique business key, so nothing at the database level
 *     stops a second copy. That is what fixes `Orthopedics = 1`: groups that
 *     were already here, missing only the tag.
 *
 *   - No business tags are invented. NPPES knows a practice's medical
 *     taxonomy; it does not know whether they take auto-injury cases, accept
 *     an attorney lien or bill PIP. Those tags stay off these rows until
 *     somebody with actual knowledge adds them.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { normalizeSpecialty } from '../../src/lib/clinic-specialties'
import type { Provider } from './fetch'
import type { ResolvedName } from './resolve-names'
import { titleCaseOrg, titleCaseStreet } from './text'

config({ path: '.env.local' })
config()

const addressKey = require('../lib/address-key') as {
  practiceKey: (p: { line1: string; line2: string; city: string; zip5: string }) => string
  extractCore: (addr: string) => string
  streetCore: (line: string) => string
}

const OUT_DIR = join(process.cwd(), 'data', 'nppes')
const PROVIDERS = join(OUT_DIR, 'providers.json')
const NAMES = join(OUT_DIR, 'org-names.json')

type State = 'FL' | 'MN'

/**
 * How many practices to keep per state and per headline specialty.
 *
 * Deliberately a cap and not "everything". The registry holds thousands of
 * Florida orthopedic enumerations, most of them a single surgeon's billing
 * LLC; importing all of them to fix a chip-ordering problem would double the
 * directory with rows nobody would ever refer to. These numbers clear the
 * threshold each state's sixth-place chip sits at with room to spare, and
 * whatever the cap drops is counted in the report rather than swallowed.
 */
const CAPS: Record<State, Record<string, number>> = {
  FL: { Orthopedics: 150, Neurosurgery: 80 },
  MN: { Orthopedics: 90, Neurosurgery: 30 },
}

/** Below this, an address is one person's office rather than a practice. */
const MIN_PROVIDERS = Number(
  process.argv.find((a) => a.startsWith('--min-providers='))?.split('=')[1] ?? 2
)

interface Cluster {
  key: string
  state: State
  line1: string
  line2: string
  city: string
  zip5: string
  orgs: Provider[]
  individuals: Provider[]
  taxonomies: Map<string, string>
  phones: string[]
}

export interface Candidate {
  id: string
  name: string
  address: string
  street: string
  city: string
  state: State
  zipCode: string
  phone: string
  specialties: string[]
  region: string | null
  county: string | null
  providerCount: number
  score: number
  sourceNpis: string[]
  available: true
  email: ''
  website: null
}

export interface MergeInstruction {
  id: string
  name: string
  matchedBy: 'address' | 'name+zip'
  addTags: string[]
  /** What the row held before, so the merge can be undone. */
  previousTags: string[]
  candidateName: string
}

const rejects: { reason: string; detail: string }[] = []
const reject = (reason: string, detail: string) => rejects.push({ reason, detail })

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** "(239) 555-1212", the way the rest of the corpus writes it. */
function formatPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10) return ''
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
}

/** The value that occurs most often, which is how a campus votes on its own phone number. */
function modal(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = ''
  let bestN = 0
  for (const [v, n] of Array.from(counts)) if (n > bestN) [best, bestN] = [v, n]
  return best
}

/**
 * Clinic tags for one practice, from its taxonomies.
 *
 * The headline tag is decided from the taxonomy CODE, not the description:
 * `207X*` is the whole orthopedic family and `207T*` is neurological surgery,
 * and a code cannot be spelled two ways. Everything else runs through
 * `normalizeSpecialty`, which is where the NPPES vocabulary was taught to the
 * catalog — so "Orthopaedic Surgery, Sports Medicine" lands on the
 * `Sports Medicine` tag that already existed instead of becoming a new one.
 */
function tagsFor(taxonomies: Map<string, string>): string[] {
  const out = new Set<string>()
  for (const [code, desc] of Array.from(taxonomies)) {
    if (code.startsWith('207X')) out.add('Orthopedics')
    if (code.startsWith('207T')) out.add('Neurosurgery')
    const mapped = normalizeSpecialty(desc)
    if (mapped) out.add(mapped)
  }
  return Array.from(out)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const providers = JSON.parse(readFileSync(PROVIDERS, 'utf8')) as Provider[]
  const resolvedNames: Record<string, ResolvedName> = existsSync(NAMES)
    ? JSON.parse(readFileSync(NAMES, 'utf8'))
    : {}

  // ---- cluster -------------------------------------------------------------
  const clusters = new Map<string, Cluster>()
  for (const p of providers) {
    const loc = p.location
    if (!loc) {
      reject('no LOCATION address', p.npi)
      continue
    }
    if (loc.state !== 'FL' && loc.state !== 'MN') {
      // The `state` filter matches the MAILING address too, so a Florida query
      // returns practices in Texas. Their LOCATION is the truth.
      reject('practice is outside FL/MN', `${p.npi} ${loc.state}`)
      continue
    }
    if (p.status && p.status !== 'A') {
      reject('deactivated NPI', p.npi)
      continue
    }
    if (/^p\s*\.?\s*o\.?\s+box|^pmb\b|general delivery/i.test(loc.line1)) {
      reject('PO Box, not a consulting room', `${p.npi} ${loc.line1}`)
      continue
    }
    if (!loc.line1 || !/^\d/.test(loc.line1)) {
      reject('address has no street number', `${p.npi} ${loc.line1}`)
      continue
    }

    const key = addressKey.practiceKey(loc)
    let c = clusters.get(key)
    if (!c) {
      c = {
        key,
        state: loc.state,
        line1: loc.line1,
        line2: loc.line2,
        city: loc.city,
        zip5: loc.zip5,
        orgs: [],
        individuals: [],
        taxonomies: new Map(),
        phones: [],
      }
      clusters.set(key, c)
    }
    if (p.enumeration === 'NPI-2' && p.orgName) c.orgs.push(p)
    else if (p.enumeration === 'NPI-1') c.individuals.push(p)
    for (const t of p.taxonomies) c.taxonomies.set(t.code, t.desc)
    if (loc.phone) c.phones.push(loc.phone)
  }

  // ---- gate and shape ------------------------------------------------------
  const candidates: Candidate[] = []
  for (const c of Array.from(clusters.values())) {
    const providerCount = c.individuals.length
    const named = c.orgs.length > 0
    const resolved = resolvedNames[c.key]

    if (!named && !resolved) {
      reject('nobody to name it', `${c.line1}, ${c.city} (${providerCount} providers)`)
      continue
    }
    if (!named && providerCount < MIN_PROVIDERS) {
      reject(`fewer than ${MIN_PROVIDERS} providers`, `${c.line1}, ${c.city}`)
      continue
    }

    const residential = /\b(apt|unit)\b|#\s*\d+[a-z]?$/i.test(`${c.line1} ${c.line2}`)
    if (residential && providerCount < 2) {
      // A single provider registered to an apartment is a home address, not a
      // practice. The same marker with several providers is a mislabelled
      // suite in a medical building, which is fine.
      reject('one provider at a residential address', `${c.line1} ${c.line2}, ${c.city}`)
      continue
    }

    const tags = tagsFor(c.taxonomies)
    if (!tags.includes('Orthopedics') && !tags.includes('Neurosurgery')) {
      reject('no orthopedic or neurosurgical taxonomy at this address', `${c.line1}, ${c.city}`)
      continue
    }

    // The practice names itself when it can: prefer an organisation whose own
    // taxonomy is the specialty in question over, say, the billing company
    // that shares the suite.
    const specialist = c.orgs.find((o: Provider) =>
      o.taxonomies.some((t: { code: string }) => t.code.startsWith('207X') || t.code.startsWith('207T'))
    )
    const anchor = specialist ?? c.orgs[0]
    const name = anchor?.orgName ? titleCaseOrg(anchor.orgName) : resolved!.name

    const phone = formatPhone(modal(c.phones) || anchor?.location?.phone || resolved?.phone || '')
    const street = titleCaseStreet([c.line1, c.line2].filter(Boolean).join(' ').trim())
    const suiteMarker = /\b(ste|suite|fl|floor|bldg|building)\b/i.test(street)

    candidates.push({
      id: anchor ? `n-${anchor.npi}` : `n-${resolved!.npi}`,
      name,
      address: `${street}, ${titleCaseOrg(c.city)}, ${c.state} ${c.zip5}`,
      street,
      city: titleCaseOrg(c.city),
      state: c.state,
      zipCode: c.zip5,
      phone,
      specialties: tags,
      region: null,
      county: null,
      providerCount,
      score:
        Math.min(providerCount, 10) +
        (specialist ? 3 : 0) +
        (phone ? 2 : 0) +
        (suiteMarker ? 1 : 0),
      sourceNpis: [...c.orgs, ...c.individuals].map((p) => p.npi),
      available: true,
      email: '',
      website: null,
    })
  }

  // Two organisations at one suite collapse into one row: same building, same
  // referral. Keep the higher-scoring shape and union what they do.
  const byId = new Map<string, Candidate>()
  for (const cand of candidates) {
    const existing = byId.get(cand.id)
    if (!existing) {
      byId.set(cand.id, cand)
      continue
    }
    existing.specialties = Array.from(new Set([...existing.specialties, ...cand.specialties]))
    existing.providerCount = Math.max(existing.providerCount, cand.providerCount)
  }
  const deduped = Array.from(byId.values())

  // ---- what is already here ------------------------------------------------
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: existing, error } = await supabase
    .from('clinics')
    .select('id, name, address, street, city, state, zip_code, specialties, region, county')
    .limit(5000)
  if (error) throw new Error(`Could not read clinics: ${error.message}`)

  const liveRows = existing ?? []
  console.log(`${liveRows.length} clinics already in the directory.`)

  const byAddress = new Map<string, (typeof liveRows)[number]>()
  const byNameZip = new Map<string, (typeof liveRows)[number]>()
  const cityToRegion = new Map<string, Map<string, number>>()
  const cityToCounty = new Map<string, Map<string, number>>()

  for (const row of liveRows) {
    const zip5 = (row.zip_code ?? '').slice(0, 5)
    const core = addressKey.extractCore(row.address ?? '')
    if (core && zip5) byAddress.set(`${core}|${zip5}`, row)
    if (row.name && zip5) byNameZip.set(`${fold(row.name)}|${zip5}`, row)

    const city = fold(row.city ?? '')
    if (city && row.region) {
      if (!cityToRegion.has(city)) cityToRegion.set(city, new Map())
      const m = cityToRegion.get(city)!
      m.set(row.region, (m.get(row.region) ?? 0) + 1)
    }
    if (city && row.county) {
      if (!cityToCounty.has(city)) cityToCounty.set(city, new Map())
      const m = cityToCounty.get(city)!
      m.set(row.county, (m.get(row.county) ?? 0) + 1)
    }
  }

  /** Majority vote, or nothing. A guessed region is worse than a blank one. */
  const vote = (table: Map<string, Map<string, number>>, city: string): string | null => {
    const m = table.get(fold(city))
    if (!m) return null
    let best: string | null = null
    let bestN = 0
    let total = 0
    for (const [value, n] of Array.from(m)) {
      total += n
      if (n > bestN) [best, bestN] = [value, n]
    }
    return total > 0 && bestN / total >= 2 / 3 ? best : null
  }

  const merges: MergeInstruction[] = []
  const fresh: Candidate[] = []

  for (const cand of deduped) {
    const core = addressKey.extractCore(cand.address)
    const hit =
      byAddress.get(`${core}|${cand.zipCode}`) ??
      byNameZip.get(`${fold(cand.name)}|${cand.zipCode}`)

    if (hit) {
      const current: string[] = Array.isArray(hit.specialties) ? hit.specialties : []
      const addTags = cand.specialties.filter((t: string) => !current.includes(t))
      if (addTags.length > 0) {
        merges.push({
          id: hit.id,
          name: hit.name,
          matchedBy: byAddress.has(`${core}|${cand.zipCode}`) ? 'address' : 'name+zip',
          addTags,
          previousTags: current,
          candidateName: cand.name,
        })
      }
      continue
    }

    cand.region = vote(cityToRegion, cand.city)
    cand.county = vote(cityToCounty, cand.city)
    fresh.push(cand)
  }

  // ---- curate --------------------------------------------------------------
  const kept: Candidate[] = []
  const overflow: Record<string, number> = {}
  for (const state of ['FL', 'MN'] as State[]) {
    for (const headline of ['Orthopedics', 'Neurosurgery']) {
      const bucket = fresh
        .filter((c) => c.state === state && c.specialties.includes(headline))
        .filter((c) => !kept.includes(c))
        .sort((a, b) => b.score - a.score || b.providerCount - a.providerCount)
      const cap = CAPS[state][headline] ?? 0
      kept.push(...bucket.slice(0, cap))
      const dropped = Math.max(0, bucket.length - cap)
      if (dropped > 0) overflow[`${state} ${headline}`] = dropped
    }
  }

  // ---- write ---------------------------------------------------------------
  writeFileSync(join(OUT_DIR, 'candidates.json'), JSON.stringify(kept, null, 2))
  writeFileSync(join(OUT_DIR, 'merges.json'), JSON.stringify(merges, null, 2))
  writeFileSync(join(OUT_DIR, 'rejected.json'), JSON.stringify(rejects, null, 2))

  const reasonCounts = new Map<string, number>()
  for (const r of rejects) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1)

  const tagCounts = new Map<string, number>()
  for (const c of kept) for (const t of c.specialties) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)

  const lines: string[] = []
  lines.push('# NPPES import — dry run', '')
  lines.push(`Harvested providers: **${providers.length}**`)
  lines.push(`Distinct practice addresses: **${clusters.size}**`)
  lines.push(`Passed the quality gates: **${deduped.length}**`)
  lines.push(`Already in the directory (merge tags instead): **${merges.length}**`)
  lines.push(`New rows after the per-bucket caps: **${kept.length}**`, '')
  lines.push('## Dropped, and why', '')
  lines.push('| Reason | Records |', '|---|---|')
  for (const [reason, n] of Array.from(reasonCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${reason} | ${n} |`)
  }
  lines.push('')
  if (Object.keys(overflow).length) {
    lines.push('## Held back by the cap', '')
    lines.push('These passed every quality gate and were still left out, because the')
    lines.push('cap is a product decision rather than a data one. Raise `CAPS` to take them.', '')
    lines.push('| Bucket | Left out |', '|---|---|')
    for (const [bucket, n] of Object.entries(overflow)) lines.push(`| ${bucket} | ${n} |`)
    lines.push('')
  }
  lines.push('## New rows by state', '')
  lines.push('| State | Rows |', '|---|---|')
  for (const state of ['FL', 'MN']) {
    lines.push(`| ${state} | ${kept.filter((c) => c.state === state).length} |`)
  }
  lines.push('', '## Tags applied', '')
  lines.push('| Tag | Rows |', '|---|---|')
  for (const [tag, n] of Array.from(tagCounts).sort((a, b) => b[1] - a[1])) lines.push(`| ${tag} | ${n} |`)
  lines.push('', '## The twenty largest, for eyeballing', '')
  lines.push('| Practice | Address | Providers | Tags |', '|---|---|---|---|')
  for (const c of [...kept].sort((a, b) => b.providerCount - a.providerCount).slice(0, 20)) {
    lines.push(`| ${c.name} | ${c.address} | ${c.providerCount} | ${c.specialties.join(', ')} |`)
  }
  lines.push('', '## Tags merged into rows already here', '')
  lines.push('| Clinic | Matched by | Tags gained |', '|---|---|---|')
  for (const m of merges.slice(0, 40)) {
    lines.push(`| ${m.name} | ${m.matchedBy} | ${m.addTags.join(', ')} |`)
  }
  if (merges.length > 40) lines.push(`| …and ${merges.length - 40} more | | |`)
  lines.push('')

  writeFileSync(join(OUT_DIR, 'report.md'), lines.join('\n'))

  console.log(`\n  ${clusters.size} distinct addresses`)
  console.log(`  ${deduped.length} passed the gates`)
  console.log(`  ${merges.length} match a clinic already here -> merge tags`)
  console.log(`  ${kept.length} new rows -> data/nppes/candidates.json`)
  if (Object.keys(overflow).length) {
    console.log(`  held back by the cap: ${JSON.stringify(overflow)}`)
  }
  console.log(`\n  report -> data/nppes/report.md`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
