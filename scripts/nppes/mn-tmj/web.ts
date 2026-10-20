/**
 * Folds the web check of the TMJ and oral-surgery rows into `web.json`, which
 * `../mn-specialists/build.ts` reads.
 *
 *   npx tsx scripts/nppes/mn-tmj/web.ts
 *
 * The check was done by research agents on 2026-10-19, each appending one
 * JSON line per row as it went (`web/*.jsonl`), so a run that died kept what
 * it had. Three kinds of file:
 *
 * - `verify-*.jsonl`: one line per registry row (`web/candidates.json`), keyed
 *   `${first NPI}|${ZIP}` — open, moved or closed, its website, and whether it
 *   treats TMJ.
 * - `sleep-check.jsonl`: the registry's dental sleep practices, by NPI. One
 *   that treats TMJ joins the TMJ group.
 * - `discover-*.jsonl`: TMJ practices found on the web. One that is in the
 *   registry under a general-dentistry code becomes that record's row; one
 *   that is not becomes a row of its own.
 *
 * `verify-z-corrections.jsonl` is read last and replaces an agent's line for
 * the same key. It holds the calls made reviewing the agents' notes: a "Moved"
 * that was a guess, two rows that are one clinic, a family dentist with an
 * oral-surgery code (`exclude`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { NppesRecord } from '../mn-specialists/fetch'
import type { WebCheck, WebFind, WebStatus } from '../mn-specialists/build'

const DIR = join(process.cwd(), 'data', 'nppes', 'mn-tmj')
const WEB = join(DIR, 'web')
const OUT = join(DIR, 'web.json')

const STATUSES: WebStatus[] = ['Confirmed', 'Moved', 'Closed', 'Unverified']
const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(llc|pllc|pa|p a|pc|ltd|inc|dds|dmd|ms|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Every JSON line of every file matching `prefix`, with the malformed ones counted, not thrown. */
function readLines<T>(prefix: string): { rows: T[]; bad: number } {
  const rows: T[] = []
  let bad = 0
  if (!existsSync(WEB)) return { rows, bad }
  for (const f of readdirSync(WEB).filter((n) => n.startsWith(prefix) && n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(WEB, f), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        rows.push(JSON.parse(line))
      } catch {
        bad++
      }
    }
  }
  return { rows, bad }
}

/** A line from an agent, trimmed to the fields the build reads. */
function toCheck(raw: Record<string, any>): WebCheck | null {
  if (!STATUSES.includes(raw.status)) return null
  const check: WebCheck = {
    status: raw.status,
    tmj: typeof raw.tmj === 'boolean' ? raw.tmj : null,
    website: typeof raw.website === 'string' ? raw.website.trim() : '',
  }
  if (raw.practice) check.practice = String(raw.practice).trim()
  if (raw.note) check.note = String(raw.note).trim()
  if (raw.exclude) check.exclude = String(raw.exclude).trim()
  if (Array.isArray(raw.specialists)) check.specialists = raw.specialists.map(String)
  if (Array.isArray(raw.only)) check.only = raw.only
  // The agents were asked for `phone` partway through the run; the lines
  // written before that carry it only in the note ("site lists ..., ph (952)
  // 683-9884"), where it is the phone of the location being checked.
  const phone = typeof raw.phone === 'string' && digits(raw.phone).length === 10
    ? raw.phone
    : /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]\d{4}\b/.exec(check.note ?? '')?.[0]
  // Not from an Unverified line: its note quotes stale directories.
  if (phone && (raw.status === 'Confirmed' || raw.status === 'Moved')) check.phone = phone
  const m = raw.moved
  if (raw.status === 'Moved' && m?.street && m?.city && /^\d{5}/.test(String(m.zip ?? ''))) {
    check.moved = { street: String(m.street), suite: m.suite ? String(m.suite) : undefined, city: String(m.city), zip: String(m.zip).slice(0, 5), phone: m.phone ? String(m.phone) : undefined }
  }
  return check
}

function main(): void {
  const records: NppesRecord[] = []
  for (const f of [join(process.cwd(), 'data', 'nppes', 'mn-specialists', 'raw.json'), join(DIR, 'raw.json')]) {
    if (existsSync(f)) records.push(...(JSON.parse(readFileSync(f, 'utf8')) as NppesRecord[]))
  }
  const orgs = new Map(records.filter((r) => r.enumeration_type === 'NPI-2' && r.basic.status === 'A').map((r) => [r.number, r]))
  const zipOf = (r: NppesRecord) => (r.location?.postal_code ?? '').slice(0, 5)

  // Registry rows: the web check of each.
  const checks: Record<string, WebCheck> = {}
  const verify = readLines<Record<string, any>>('verify-')
  const candidates = JSON.parse(readFileSync(join(WEB, 'candidates.json'), 'utf8')) as { key: string; name: string; phone: string; address: string }[]
  const known = new Set(candidates.map((c) => c.key))
  let stray = 0
  for (const line of verify.rows) {
    const check = toCheck(line)
    if (!check || !known.has(line.key)) {
      stray++
      continue
    }
    checks[line.key] = check
  }

  // Sleep practices: TMJ joins them to the TMJ group.
  const tmjNpis = new Set<string>()
  const sleep = readLines<Record<string, any>>('sleep-check')
  for (const line of sleep.rows) {
    const r = orgs.get(String(line.npi))
    const check = toCheck(line)
    if (!r || !check) continue
    if (check.tmj && check.status !== 'Closed') tmjNpis.add(r.number)
    // Zoya's and Bloomington Sleep and TMD are rows already; their own check wins.
    checks[`${r.number}|${zipOf(r)}`] ??= check
  }

  // Finds: matched to a registry record by phone or by name, in the same ZIP.
  // The ZIP matters: The Facial Pain Center answers eight offices on two
  // numbers, and by phone alone every new branch was "already on the list".
  const byPhone = new Map<string, string>()
  const byNameZip = new Map<string, string>()
  for (const r of Array.from(orgs.values())) {
    for (const loc of [r.location, ...(r.practiceLocations ?? [])]) {
      if (!loc || loc.state !== 'MN') continue
      const zip = (loc.postal_code ?? '').slice(0, 5)
      if (digits(loc.telephone_number)) byPhone.set(`${digits(loc.telephone_number)}|${zip}`, r.number)
      for (const n of [r.basic.organization_name ?? '', ...r.otherNames.map((o) => o.name)]) {
        byNameZip.set(`${fold(n)}|${zip}`, r.number)
      }
    }
  }
  const zipOfAddress = (a: string) => /(\d{5})$/.exec(a)?.[1] ?? ''
  // Where every row is now: its registry address, or where the check moved it.
  const covered = new Set(candidates.map((c) => `${digits(c.phone)}|${zipOfAddress(c.address)}`))
  const candidateNames = new Set(candidates.map((c) => `${fold(c.name)}|${zipOfAddress(c.address)}`))
  for (const [key, c] of Object.entries(checks)) {
    if (!known.has(key)) continue
    if (c.moved) covered.add(`${digits(c.moved.phone ?? c.phone)}|${c.moved.zip}`)
    if (c.phone) covered.add(`${digits(c.phone)}|${c.moved?.zip ?? key.split('|')[1]}`)
    if (c.practice) candidateNames.add(`${fold(c.practice)}|${c.moved?.zip ?? key.split('|')[1]}`)
  }

  const finds: WebFind[] = []
  const seen = new Set<string>()
  let duplicates = 0
  const discover = readLines<Record<string, any>>('discover-')
  for (const line of discover.rows) {
    const zip = String(line.zip ?? '').slice(0, 5)
    if (!line.name || !line.street || !line.city || !/^\d{5}$/.test(zip) || !digits(line.phone)) continue
    const nameZip = `${fold(line.name)}|${zip}`
    const dedupe = `${digits(line.phone)}|${zip}`
    // Already a row (the agents were told, but check), or already found.
    if (covered.has(dedupe) || candidateNames.has(nameZip) || seen.has(dedupe)) {
      duplicates++
      continue
    }
    seen.add(dedupe)
    const npi = byNameZip.get(nameZip) ?? byPhone.get(dedupe)
    const note = [line.basis && `basis: ${line.basis}`, line.dentist && `dentist: ${line.dentist}`, line.note].filter(Boolean).join('; ')
    // "Andrew Greenslade, DMD (Dawson Academy)" -> the name; the training stays in the note.
    const dentists = String(line.dentist ?? '')
      .split(';')
      .map((d) => d.replace(/\s*\([^)]*\)/g, '').trim())
      .filter((d) => d && !/^dr\.?\s+\w+$/i.test(d))
    if (npi) {
      const r = orgs.get(npi)!
      tmjNpis.add(npi)
      // Same place means same ZIP AND same house number: Riverfront Dental moved
      // across Fergus Falls, from 1108 Western Ave to 124 E Lincoln Ave.
      const house = (s: string | undefined) => /^\s*(\d+)/.exec(s ?? '')?.[1] ?? ''
      const samePlace = zipOf(r) === zip && house(r.location?.address_1) === house(String(line.street))
      // A row's own verify line, when it has one, knows more than a find does.
      checks[`${npi}|${zipOf(r)}`] ??= {
        status: samePlace ? 'Confirmed' : 'Moved',
        tmj: true,
        website: String(line.website ?? ''),
        practice: String(line.name),
        phone: String(line.phone),
        ...(dentists.length ? { specialists: dentists } : {}),
        note,
        ...(samePlace ? {} : { moved: { street: String(line.street), suite: line.suite, city: String(line.city), zip, phone: String(line.phone) } }),
      }
    }
    finds.push({
      name: String(line.name),
      street: String(line.street),
      suite: line.suite ? String(line.suite) : undefined,
      city: String(line.city),
      zip,
      phone: String(line.phone),
      website: String(line.website ?? ''),
      npi,
      dentist: dentists.length ? dentists.join('; ') : undefined,
      note,
    })
  }

  writeFileSync(OUT, JSON.stringify({ checks, finds, tmjNpis: Array.from(tmjNpis).sort() }, null, 1))
  const by = (xs: WebCheck[]) => STATUSES.map((s) => `${s} ${xs.filter((x) => x.status === s).length}`).join(', ')
  const verified = candidates.filter((c) => checks[c.key])
  console.log(`Registry rows checked: ${verified.length} of ${candidates.length} (${by(verified.map((c) => checks[c.key]))}); TMJ on site: ${verified.filter((c) => checks[c.key].tmj).length}.`)
  console.log(`Sleep practices: ${sleep.rows.length} checked, ${sleep.rows.filter((l) => l.tmj === true).length} treat TMJ.`)
  console.log(`Finds: ${finds.length} new (${finds.filter((f) => f.npi).length} matched to a registry record), ${duplicates} duplicates dropped.`)
  if (verify.bad + sleep.bad + discover.bad + stray) {
    console.log(`Skipped: ${verify.bad + sleep.bad + discover.bad} malformed lines, ${stray} lines with an unknown key or status.`)
  }
  console.log(`-> ${OUT}`)
}

main()
