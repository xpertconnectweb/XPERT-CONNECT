/**
 * Turns the FDACS registration export into body-shop sightings for build.ts.
 *
 *   npx tsx scripts/bodyshops/fdacs.ts
 *
 * Florida makes every motor-vehicle repair shop register with FDACS. Its
 * License Lookup (consumercompliance.fdacs.gov, type "Motor Vehicle Repair")
 * exports what it holds as CSV; save it as `data/bodyshops/fdacs/licenses-*.csv`.
 * On 2026-11-05 that was 3,839 shops: the lookup is still migrating from a
 * legacy system, so it is a current sample, not the whole state.
 *
 * Kept: shops whose name or DBA says body work, and any registered shop in a
 * building the EPA files under NAICS 811121 ("Joe's Auto Repair" that also
 * paints). The export names sole proprietors by their own name; those shops
 * are listed under their DBA, and the owner's name never leaves this folder,
 * which is not committed (it also holds contact emails).
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EpaFacility } from './fetch'

const addressKey = require('../lib/address-key') as { canonicalStreet: (s: string) => string }

const DIR = join(process.cwd(), 'data', 'bodyshops')
const FDACS = join(DIR, 'fdacs')

const BODY = /\b(collision|collisions|body|bodies|bodyshop|bodyworks|body works|paint|painting|refinish|refinishing|carstar|maaco|caliber|gerber|crash champions|fix auto|joe hudson|dent|dents|bumper|frame)\b/i
const BUSINESS = /\b(llc|l\.l\.c|inc|corp|corporation|co|company|ltd|lp|llp|pa|group|enterprises?|holdings?|auto|automotive|motors?|body|collision|paint|garage|shop|repair|service|services|center|centre|works|customs?|cars?|truck|tire|tires|international|usa|of|and|&)\b/i

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) rows.push([...row, cur])
  return rows
}

const splitSuite = (line: string) => line.replace(/\s+((?:ste|suite|unit|rm|room|bldg|building|#)\b.*|#.*)$/i, '')
const buildingKey = (street: string, zip: string) => `${addressKey.canonicalStreet(splitSuite(street))}|${zip}`

/** "121 East McKenzie Street, Punta Gorda, FL 33950" -> parts. */
function parseLocation(raw: string): { street: string; city: string; zip: string } | null {
  const parts = raw.trim().split(/\s*,\s*/).filter(Boolean)
  const m = /^FL\s+(\d{5})/i.exec(parts[parts.length - 1] ?? '')
  if (!m || parts.length < 3) return null
  return { street: parts.slice(0, -2).join(' '), city: parts[parts.length - 2], zip: m[1] }
}

function main(): void {
  const epa = (JSON.parse(readFileSync(join(DIR, 'epa.json'), 'utf8')) as EpaFacility[]).filter((f) => f.state === 'FL')
  const epaBuildings = new Set(epa.filter((f) => f.street).map((f) => buildingKey(f.street, f.zip)))

  const out: unknown[] = []
  let read = 0
  let viaName = 0
  let viaBuilding = 0
  let owners = 0
  const registeredPhones = new Set<string>()
  for (const file of readdirSync(FDACS).filter((f) => /^licenses.*\.csv$/.test(f))) {
    const [head, ...rows] = parseCsv(readFileSync(join(FDACS, file), 'utf8').replace(/^﻿/, ''))
    const col = (name: string) => head.indexOf(name)
    const at = {
      name: col('Business Name'),
      loc: col('Location'),
      phone: col('Phone'),
      license: col('License Number'),
      status: col('Status'),
      dba: col('DBA/Other Names'),
    }
    for (const r of rows) {
      if (r.length < head.length - 1) continue
      read++
      if (r[at.status] !== 'Registered') continue
      const ph = (r[at.phone] ?? '').replace(/[^0-9]/g, '').slice(-10)
      if (ph.length === 10) registeredPhones.add(ph)
      const loc = parseLocation(r[at.loc] ?? '')
      if (!loc) continue
      const legal = (r[at.name] ?? '').trim()
      const dbas = (r[at.dba] ?? '').split(/\s*[;,]\s*(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean)
      const named = BODY.test(`${legal} ${dbas.join(' ')}`)
      const inEpaBuilding = epaBuildings.has(buildingKey(loc.street, loc.zip))
      if (!named && !inEpaBuilding) continue
      if (named) viaName++
      else viaBuilding++

      // A sole proprietor registers under their own name; the shop is the DBA.
      const isPerson = !BUSINESS.test(legal)
      if (isPerson) owners++
      const name = isPerson ? dbas[0] ?? '' : legal
      const altName = (isPerson ? dbas.slice(1) : dbas).find((d) => BODY.test(d)) ?? (isPerson ? undefined : dbas[0])
      out.push({
        ref: `fdacs:${r[at.license]}`,
        // A DBA that says "body" is the name the shop goes by.
        name: !isPerson && altName && BODY.test(altName) && !BODY.test(legal) ? altName : name,
        altName: !isPerson && altName && BODY.test(altName) && !BODY.test(legal) ? legal : altName,
        street: loc.street,
        city: loc.city,
        state: 'FL',
        zip: loc.zip,
        phone: r[at.phone] || undefined,
        status: 'Registered',
        sourceUrl: 'https://consumercompliance.fdacs.gov/Business-Search/',
      })
    }
  }
  writeFileSync(join(FDACS, 'fdacs.json'), JSON.stringify(out, null, 1))
  // Every registered shop's phone, body work or not: a shop found elsewhere
  // under another name is still confirmed if its number is registered.
  writeFileSync(join(FDACS, 'phones.json'), JSON.stringify(Array.from(registeredPhones)))
  console.log(
    `FDACS: ${read} registrations read; kept ${out.length} (${viaName} by name, ${viaBuilding} in an EPA body-shop building); ${owners} filed under an owner's name.`
  )
}

main()
