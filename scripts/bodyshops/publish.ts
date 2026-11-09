/**
 * Writes the public Body Shops Directory's data from the research output.
 *
 *   npx tsx scripts/bodyshops/publish.ts
 *
 * Input: `data/bodyshops/bodyshops.json`, written by build.ts.
 * Output: `src/data/body-shops.json`, which the site reads through
 * `src/lib/body-shops.ts`.
 *
 * Only VERIFIED shops are published, the same set as the Florida and
 * Minnesota tabs of the client's spreadsheet. "Verified" means a chain
 * locator page, an FDACS registration, the shop's own website printing the
 * same phone, or AASP-MN membership. The "Por verificar" rows are not
 * published. The client hand-checked a directory-only row and nothing about
 * it matched, so a row like that must not reach a public page either.
 *
 * The output is a snapshot, committed with the code. The data changes only
 * when this script runs again, so a refresh is: build.ts, this script, a
 * deploy. No database is involved.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

interface ResearchShop {
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
  confirmed: boolean
}

export interface PublishedShop {
  id: string
  name: string
  /** The chain's name, or "" for an independent shop. */
  brand: string
  street: string
  city: string
  state: 'FL' | 'MN'
  zip: string
  /** Bare, the storage convention: "Hennepin", not "Hennepin County". */
  county: string
  phone: string
  website: string
}

const IN = join(process.cwd(), 'data', 'bodyshops', 'bodyshops.json')
const OUT = join(process.cwd(), 'src', 'data', 'body-shops.json')

/**
 * The chain as a visitor knows it.
 *
 * The research notes the parent group in brackets ("LaMettry's Collision
 * (Quality Collision Group)"), which is useful in a spreadsheet and noise on a
 * filter card.
 */
function brandLabel(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function main(): void {
  const all = JSON.parse(readFileSync(IN, 'utf8')) as ResearchShop[]
  const out: PublishedShop[] = []
  const seen = new Set<string>()
  const problems: string[] = []

  for (const s of all) {
    if (!s.confirmed) continue
    if (s.state !== 'FL' && s.state !== 'MN') {
      problems.push(`${s.id}: state ${s.state}`)
      continue
    }
    if (!s.phone || !s.name || !s.city) {
      problems.push(`${s.id}: missing phone, name or city`)
      continue
    }
    if (seen.has(s.id)) {
      problems.push(`${s.id}: duplicate id`)
      continue
    }
    seen.add(s.id)
    out.push({
      id: s.id,
      name: s.name,
      brand: brandLabel(s.brand ?? ''),
      street: s.street ?? '',
      city: s.city,
      state: s.state,
      zip: s.zip ?? '',
      county: s.county ?? '',
      phone: s.phone,
      website: s.website ?? '',
    })
  }

  out.sort((a, b) => a.id.localeCompare(b.id))
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`)

  const byState = out.reduce<Record<string, number>>((acc, s) => {
    acc[s.state] = (acc[s.state] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `Published ${out.length} verified shops (${Object.entries(byState)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}) to src/data/body-shops.json.`
  )
  if (problems.length) {
    console.log(`Skipped ${problems.length}:`)
    problems.forEach((p) => console.log(`  ${p}`))
  }
}

main()
