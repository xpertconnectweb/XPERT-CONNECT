/**
 * Completa los datos de las 2 firms placeholder ("Rodriguez & Associates
 * Law Firm" y "MN Legal Group") con direcciones reales de Miami y
 * Minneapolis, coordenadas del centro de cada ciudad, region/county
 * correctos, teléfonos en el rango ficticio FCC (555-0100..0199), y
 * marca available=true.
 *
 *   npx tsx scripts/complete-demo-firms.ts          # dry run
 *   npx tsx scripts/complete-demo-firms.ts --apply  # write
 *
 * Idempotente: re-correr no rompe nada.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface FirmUpdate {
  matchName: string
  patch: {
    address: string
    lat: number
    lng: number
    phone: string
    practice_areas: string[]
    region: string
    county: string
    zip_code: string
    available: boolean
  }
}

const UPDATES: FirmUpdate[] = [
  {
    matchName: 'Rodriguez & Associates Law Firm',
    patch: {
      address: '1395 Brickell Ave, Miami, FL 33131',
      lat: 25.7617,
      lng: -80.1918,
      phone: '(305) 555-0100',
      practice_areas: ['Personal Injury', 'Auto Accident', 'Slip and Fall'],
      region: 'South Florida',
      county: 'Miami-Dade',
      zip_code: '33131',
      available: true,
    },
  },
  {
    matchName: 'MN Legal Group',
    patch: {
      address: '100 S 5th St, Minneapolis, MN 55402',
      lat: 44.9778,
      lng: -93.2650,
      phone: '(612) 555-0100',
      practice_areas: ['Personal Injury', 'Auto Accident', 'Slip and Fall'],
      region: 'Twin Cities Metro',
      county: 'Hennepin',
      zip_code: '55402',
      available: true,
    },
  },
]

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

async function main() {
  console.log(c.bold('\nComplete demo firms with realistic data'))
  console.log(c.dim(apply ? 'Mode: APPLY\n' : 'Mode: DRY RUN — pass --apply to write\n'))

  for (const u of UPDATES) {
    const { data: existing, error } = await supabase
      .from('lawyers')
      .select('id, name, address, lat, lng, available')
      .eq('name', u.matchName)
    if (error) { console.log(c.red(`  ✗ lookup failed: ${error.message}`)); continue }
    if (!existing || existing.length === 0) {
      console.log(c.yellow(`  ⚠ skipping — no firm named "${u.matchName}"`))
      continue
    }
    if (existing.length > 1) {
      console.log(c.red(`  ✗ ambiguous — ${existing.length} firms named "${u.matchName}"`))
      continue
    }

    const firm = existing[0]
    console.log(`${c.bold(firm.name)}  (id=${firm.id})`)
    console.log(`  before:  address="${firm.address}"  lat=${firm.lat}  lng=${firm.lng}  available=${firm.available}`)
    console.log(`  after:   address="${u.patch.address}"  lat=${u.patch.lat}  lng=${u.patch.lng}  available=${u.patch.available}`)

    if (apply) {
      const { error: updErr } = await supabase
        .from('lawyers')
        .update(u.patch)
        .eq('id', firm.id)
      if (updErr) console.log(c.red(`  ✗ update failed: ${updErr.message}\n`))
      else console.log(c.green(`  ✓ updated\n`))
    } else {
      console.log(c.dim('  (dry run — nothing written)\n'))
    }
  }

  if (apply) {
    console.log(c.bold('Demo firms ready.'))
    console.log(c.dim('\nNext: log in as a clinic and open the "Refer to Lawyer" CTA on /professionals to see them in the picker.'))
  }
}

main().catch((e) => { console.error(c.red('Fatal:'), e); process.exit(1) })
