/**
 * Rewrites stored clinic and lawyer coordinates using the self-hosted engine.
 *
 *   npx tsx scripts/geo/regeocode.ts                 # dry run, writes nothing
 *   npx tsx scripts/geo/regeocode.ts --apply         # writes, after a backup
 *   npx tsx scripts/geo/regeocode.ts --min=200       # only rows this far out
 *   npx tsx scripts/geo/regeocode.ts --restore=data/backups/geo-coords-<stamp>.json
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The engine improvements changed what the SEARCH answers. They did nothing to
 * the coordinates already written to the database, which came from a Geoapify
 * backfill measured 29% wrong beyond 50 m. Against the county registers, on
 * 876 real platform records, the engine and the stored coordinate disagree by
 * more than 50 m on 438 of them, and the median disagreement is 52 m -- so
 * more than half the pins on this platform are on a building that is not the
 * one on the record.
 *
 * ── What it will not do quietly ─────────────────────────────────────────────
 *
 * Dry run is the default. `--apply` is required to write, and it takes a full
 * backup of every coordinate it is about to touch BEFORE touching any of them,
 * to `data/backups/` -- which is gitignored, so the file stays on the machine
 * that ran it. `--restore` puts every one of them back.
 *
 * ── The honest caveat about the far tail ────────────────────────────────────
 *
 * A disagreement is not automatically the stored coordinate's fault. Geoapify
 * was 29% wrong past 50 m; the engine was 100% within 50 m on 201
 * county-verified addresses, so the balance is heavily one way -- but a row
 * that moves 9.8 km could equally be the engine matching a different street on
 * a thin address like "2500 Harbor Blvd, Ste 105".
 *
 * So the far movers are written like the rest when asked for, and also listed
 * separately at the end. With the backup in place, reverting a handful is one
 * command; the point of the list is that somebody looks.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { haversineDistance } from '../../src/lib/map/geo'
import { LocalIndex } from './lib/local-index'
import { localProvider } from './lib/local-provider'

config({ path: '.env.local' })
config()

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const has = (name: string) => process.argv.includes(`--${name}`)

const METRES_PER_MILE = 1609.344
const BACKUP_DIR = 'data/backups'

/** Below this the stored coordinate is already right and nothing is gained. */
const MIN_MOVE_M = Number(arg('min') ?? 50)
/** Movers past this get their own list, whatever the run decided to write. */
const FAR_M = 10_000

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

interface Row {
  table: 'clinics' | 'lawyers'
  id: string
  name: string
  address: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
}

/** One line of the backup: enough to put a row back exactly as it was. */
interface Saved {
  table: 'clinics' | 'lawyers'
  id: string
  lat: number | null
  lng: number | null
}

async function fetchRows(): Promise<Row[]> {
  const out: Row[] = []
  for (const table of ['clinics', 'lawyers'] as const) {
    const { data, error } = await supabase
      .from(table)
      .select('id, name, address, street, city, state, zip_code, lat, lng')
      .limit(2000)
    if (error) throw new Error(`${table}: ${error.message}`)

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const address = typeof row.address === 'string' ? row.address : ''
      if (!address.trim()) continue
      out.push({
        table,
        id: String(row.id),
        name: String(row.name ?? ''),
        address,
        street: (row.street as string) ?? null,
        city: (row.city as string) ?? null,
        state: (row.state as string) ?? null,
        zip: (row.zip_code as string) ?? null,
        lat: typeof row.lat === 'number' ? row.lat : null,
        lng: typeof row.lng === 'number' ? row.lng : null,
      })
    }
  }
  return out
}

/** The address as the engine will receive it, matching gate-coverage.ts. */
function queryFor(row: Row): string {
  const head = row.street ?? row.address
  const tail = [row.city, [row.state, row.zip].filter(Boolean).join(' ')].filter(Boolean)
  return tail.length > 0 ? [head, ...tail].join(', ') : head
}

async function restore(path: string) {
  const saved = JSON.parse(await readFile(path, 'utf8')) as Saved[]
  console.log(`\n  Restoring ${saved.length} coordinates from ${path}\n`)

  let done = 0
  for (const row of saved) {
    const { error } = await supabase
      .from(row.table)
      .update({ lat: row.lat, lng: row.lng })
      .eq('id', row.id)
    if (error) console.log(`  x ${row.table}/${row.id}: ${error.message}`)
    else done++
  }
  console.log(`\n  Restored ${done} of ${saved.length}.\n`)
}

interface Move {
  row: Row
  lat: number
  lng: number
  metres: number
  precision: string
  matched: string
}

async function main() {
  const restorePath = arg('restore')
  if (restorePath) return restore(restorePath)

  const apply = has('apply')
  const rooftopOnly = has('rooftop-only')

  process.stdout.write('  loading the index… ')
  const index = await LocalIndex.load()
  console.log(`${index.size.toLocaleString('en-US')} streets`)

  const rows = await fetchRows()
  console.log(`  ${rows.length.toLocaleString('en-US')} records with an address\n`)

  const provider = localProvider(index)
  let moves: Move[] = []
  let unmoved = 0
  let missed = 0
  let unplaced = 0

  for (const row of rows) {
    const result = await provider.autocomplete(queryFor(row), { limit: 1, state: row.state })
    if (!result.ok || result.value.length === 0) {
      missed++
      continue
    }
    const best = result.value[0]
    if (best.lat === null || best.lng === null) {
      missed++
      continue
    }

    // A row with no coordinate, or one parked at (0, 0), is not a
    // disagreement -- it is the case this engine exists to fill in, and it is
    // always written regardless of the threshold.
    const placed = row.lat !== null && row.lng !== null && !(row.lat === 0 && row.lng === 0)
    if (!placed) {
      unplaced++
      moves.push({
        row,
        lat: best.lat,
        lng: best.lng,
        metres: Infinity,
        precision: best.precision,
        matched: best.fullLabel,
      })
      continue
    }

    const metres = haversineDistance(row.lat!, row.lng!, best.lat, best.lng) * METRES_PER_MILE
    if (metres <= MIN_MOVE_M) {
      unmoved++
      continue
    }
    moves.push({ row, lat: best.lat, lng: best.lng, metres, precision: best.precision, matched: best.fullLabel })
  }

  if (rooftopOnly) {
    const dropped = moves.filter((m) => m.precision !== 'rooftop').length
    moves = moves.filter((m) => m.precision === 'rooftop')
    console.log(`  --rooftop-only: ${dropped} rows the engine could not place are left alone.
`)
  }

  const far = moves.filter((m) => Number.isFinite(m.metres) && m.metres > FAR_M)

  console.log(`  already within ${MIN_MOVE_M} m ....... ${String(unmoved).padStart(4)}   left alone`)
  console.log(`  no coordinate at all ....... ${String(unplaced).padStart(4)}   filled in`)
  console.log(`  would move .................. ${String(moves.length - unplaced).padStart(4)}`)
  console.log(`    of those, over ${FAR_M / 1000} km ..... ${String(far.length).padStart(4)}`)
  console.log(`  engine found nothing ....... ${String(missed).padStart(4)}   untouched\n`)

  /**
   * The breakdown that decides whether this is safe, and the reason the whole
   * project has a precision vocabulary.
   *
   * `rooftop` means the county register holds that exact house number: the
   * answer is the building, and a big move is the stored coordinate being
   * wrong. Anything else means the engine could not place the number and is
   * offering the street it thinks is closest -- which on a thin address like
   * "Moore Haven, FL" can be a road of a similar name 170 km away.
   *
   * So distance alone is the wrong filter. A 1,600 km move at `street` is the
   * engine guessing; a 1,600 km move at `rooftop` is a record in the wrong
   * state.
   */
  const band = (m: Move) => (Number.isFinite(m.metres) && m.metres > FAR_M ? 'over 10 km' : 'under 10 km')
  const tally = new Map<string, number>()
  for (const m of moves) {
    const k = `${band(m)}|${m.precision === 'rooftop' ? 'rooftop' : 'not rooftop'}`
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }

  console.log('  WHAT THE ENGINE CLAIMS ABOUT THE ROWS IT WOULD MOVE\n')
  console.log(`  ${''.padEnd(14)}${'rooftop'.padStart(12)}${'not rooftop'.padStart(14)}`)
  for (const b of ['under 10 km', 'over 10 km']) {
    console.log(
      `  ${b.padEnd(14)}${String(tally.get(`${b}|rooftop`) ?? 0).padStart(12)}` +
        `${String(tally.get(`${b}|not rooftop`) ?? 0).padStart(14)}`
    )
  }
  console.log(
    `\n  rooftop = the register holds that exact house number, so the pin is the\n` +
      `  building. Anything else = the engine could not place the number and is\n` +
      `  offering a street. Use --rooftop-only to write just the first column.\n`
  )

  if (!apply) {
    console.log(`  DRY RUN. Nothing was written. Re-run with --apply.\n`)
    printFar(far)
    return
  }

  // The backup comes first, in full, before a single row is touched.
  await mkdir(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${BACKUP_DIR}/geo-coords-${stamp}.json`
  const saved: Saved[] = moves.map((m) => ({
    table: m.row.table,
    id: m.row.id,
    lat: m.row.lat,
    lng: m.row.lng,
  }))
  await writeFile(backupPath, JSON.stringify(saved, null, 2), 'utf8')
  console.log(`  backup written: ${backupPath}  (${saved.length} rows)\n`)

  let written = 0
  const failed: Array<{ id: string; message: string }> = []
  for (const m of moves) {
    const { error } = await supabase
      .from(m.row.table)
      .update({ lat: m.lat, lng: m.lng })
      .eq('id', m.row.id)
    if (error) failed.push({ id: `${m.row.table}/${m.row.id}`, message: error.message })
    else written++
    if (written % 50 === 0) process.stdout.write(`  ${written}/${moves.length}\r`)
  }

  console.log(`${' '.repeat(30)}\r  wrote ${written} of ${moves.length}.`)
  for (const f of failed) console.log(`  x ${f.id}: ${f.message}`)
  console.log(`\n  To undo everything:\n    npx tsx scripts/geo/regeocode.ts --restore=${backupPath}\n`)

  printFar(far)
}

function printFar(far: Move[]) {
  if (far.length === 0) return
  console.log(`  ${'─'.repeat(72)}`)
  console.log(`  MOVED MORE THAN ${FAR_M / 1000} KM — read these, they are the ambiguous ones\n`)
  console.log(
    `  A jump this size is usually a stored coordinate in the wrong city, and\n` +
      `  sometimes the engine matching a different street on a thin address.\n` +
      `  The backup makes reverting any of them one command.\n`
  )
  for (const m of far.sort((a, b) => b.metres - a.metres)) {
    console.log(`  ${(m.metres / 1000).toFixed(1).padStart(7)} km  ${m.row.table}/${m.row.id}  ${m.row.name}`)
    console.log(`             pedido:  ${queryFor(m.row)}`)
    console.log(`             motor:   ${m.matched}  [${m.precision}]`)
  }
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
