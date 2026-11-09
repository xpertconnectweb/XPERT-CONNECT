/**
 * Harvests the body shops two public sources can name in Florida and Minnesota.
 *
 *   npx tsx scripts/bodyshops/fetch.ts [--refresh]
 *
 * The client asked (2026-11-05) for a list of body shops, "parecido a lo que
 * hicimos con abogados". No state licenses body shops in Minnesota, and
 * Florida's repair-shop registration (FDACS) has no bulk download, so the
 * registry-shaped start is the EPA:
 *
 * - **EPA ECHO**, every facility filed under NAICS 811121 (Automotive Body,
 *   Paint, and Interior Repair). A body shop that throws away paint, solvent or
 *   thinner is a hazardous-waste handler, and one with a spray booth may hold
 *   an air permit, so most of them are in it. Like NPPES it is a census, not a
 *   roll call: closed shops linger, and it has no phone numbers.
 * - **OpenStreetMap**, car-repair shops tagged or named for body work. Fewer,
 *   but some carry a phone and a website.
 *
 * Chains and the web check come later, from research agents (`web/*.jsonl`).
 * Responses are cached under `data/bodyshops/`; `--refresh` fetches again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const STATES = ['FL', 'MN'] as const
const OUT_DIR = join(process.cwd(), 'data', 'bodyshops')
const EPA = join(OUT_DIR, 'epa.json')
const OSM = join(OUT_DIR, 'osm.json')
const refresh = process.argv.includes('--refresh')

const ECHO = 'https://echodata.epa.gov/echo/echo_rest_services'
/** Automotive Body, Paint, and Interior Repair and Maintenance. */
const NAICS = '811121'

export interface EpaFacility {
  registryId: string
  name: string
  street: string
  city: string
  state: string
  zip: string
  county: string
  fips: string
  lat: number | null
  lng: number | null
  naics: string
  /** RCRA handler status ("Active (H)", "Inactive"), when the shop is in RCRA. */
  rcraStatus: string | null
  /** Programs the facility is filed under ("RCRA", "AIR", "NPDES", ...). */
  programs: string[]
}

export interface OsmShop {
  osmId: string
  name: string
  state: string
  street: string | null
  city: string | null
  zip: string | null
  phone: string | null
  website: string | null
  lat: number
  lng: number
  tags: Record<string, string>
}

async function getJson(url: string, init?: RequestInit, tries = 4): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': 'xpert-connect-list-research/1.0', ...init?.headers } })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await res.json()
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url.slice(0, 120)}: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 5000 * 2 ** (attempt - 1)))
    }
  }
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function fetchEpa(state: string): Promise<EpaFacility[]> {
  const head = (await getJson(`${ECHO}.get_facilities?output=JSON&p_st=${state}&p_ncs=${NAICS}`)) as {
    Results: { QueryID: string; QueryRows: string }
  }
  const { QueryID, QueryRows } = head.Results
  const total = Number(QueryRows)
  const out: EpaFacility[] = []
  for (let page = 1; out.length < total; page++) {
    const body = (await getJson(`${ECHO}.get_qid?output=JSON&qid=${QueryID}&pageno=${page}&responseset=1000`)) as {
      Results: { Facilities?: Record<string, unknown>[] }
    }
    const rows = body.Results.Facilities ?? []
    if (rows.length === 0) break
    for (const f of rows) {
      out.push({
        registryId: str(f.RegistryID),
        name: str(f.FacName),
        street: str(f.FacStreet),
        city: str(f.FacCity),
        state: str(f.FacState),
        zip: str(f.FacZip).slice(0, 5),
        county: str(f.FacCounty),
        fips: str(f.FacDerivedStctyFIPS) || str(f.FacFIPSCode),
        lat: num(f.FacLat),
        lng: num(f.FacLong),
        naics: str(f.FacNAICSCodes),
        rcraStatus: null,
        programs: Object.keys(f)
          .filter((k) => /IDs$/.test(k) && k !== 'BadSystemIDs' && str(f[k]) !== '')
          .map((k) => k.replace(/IDs$/, '')),
      })
    }
  }
  console.log(`  EPA ${state}: ${out.length} of ${total}`)
  return out
}

/** The RCRA service carries the handler status the all-programs search lacks. */
async function fetchRcraStatus(state: string): Promise<Map<string, string>> {
  const head = (await getJson(`https://echodata.epa.gov/echo/rcra_rest_services.get_facilities?output=JSON&p_st=${state}&p_ncs=${NAICS}`)) as {
    Results: { QueryID: string; QueryRows: string }
  }
  const status = new Map<string, string>()
  for (let page = 1; status.size < Number(head.Results.QueryRows); page++) {
    const body = (await getJson(
      `https://echodata.epa.gov/echo/rcra_rest_services.get_qid?output=JSON&qid=${head.Results.QueryID}&pageno=${page}&responseset=1000`
    )) as { Results: { Facilities?: Record<string, unknown>[] } }
    const rows = body.Results.Facilities ?? []
    if (rows.length === 0) break
    for (const f of rows) status.set(str(f.RegistryID), str(f.RCRAStatus).replace(/\s+/g, ' ').replace(' )', ')'))
  }
  return status
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

async function fetchOsm(state: string): Promise<OsmShop[]> {
  const q = `[out:json][timeout:180];area["ISO3166-2"="US-${state}"]->.a;(
    nwr(area.a)["shop"="car_repair"]["name"~"collision|body|paint|carstar|maaco|caliber|gerber|crash champions|fix auto|joe hudson",i];
    nwr(area.a)["shop"="car_repair"]["service:vehicle:body_repair"="yes"];
    nwr(area.a)["shop"="car_repair"]["car_repair"~"body|paint",i];
    nwr(area.a)["craft"="car_painter"];
  );out center tags;`
  let lastErr: Error | null = null
  for (let round = 0; round < 3; round++) {
    for (const endpoint of OVERPASS) {
      try {
        const body = (await getJson(endpoint, { method: 'POST', body: new URLSearchParams({ data: q }) }, 1)) as {
          elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
        }
        const out = body.elements
          .filter((e) => e.tags?.name)
          .map((e) => {
            const t = e.tags!
            const house = t['addr:housenumber'], street = t['addr:street']
            return {
              osmId: `${e.type}/${e.id}`,
              name: t.name,
              state,
              street: house && street ? `${house} ${street}` : street ?? null,
              city: t['addr:city'] ?? null,
              zip: t['addr:postcode']?.slice(0, 5) ?? null,
              phone: t.phone ?? t['contact:phone'] ?? null,
              website: t.website ?? t['contact:website'] ?? null,
              lat: e.lat ?? e.center!.lat,
              lng: e.lon ?? e.center!.lon,
              tags: t,
            }
          })
        console.log(`  OSM ${state}: ${out.length} (${endpoint})`)
        return out
      } catch (err) {
        lastErr = err as Error
      }
    }
    await new Promise((r) => setTimeout(r, 30000 * (round + 1)))
  }
  throw lastErr ?? new Error('Overpass failed')
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  if (refresh || !existsSync(EPA)) {
    const all: EpaFacility[] = []
    for (const state of STATES) {
      const rows = await fetchEpa(state)
      const status = await fetchRcraStatus(state)
      for (const r of rows) r.rcraStatus = status.get(r.registryId) ?? null
      all.push(...rows)
    }
    writeFileSync(EPA, JSON.stringify(all, null, 1))
  } else {
    console.log(`  EPA: cached (${(JSON.parse(readFileSync(EPA, 'utf8')) as unknown[]).length} rows)`)
  }

  if (refresh || !existsSync(OSM)) {
    const all: OsmShop[] = []
    for (const state of STATES) all.push(...(await fetchOsm(state)))
    writeFileSync(OSM, JSON.stringify(all, null, 1))
  } else {
    console.log(`  OSM: cached (${(JSON.parse(readFileSync(OSM, 'utf8')) as unknown[]).length} rows)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
