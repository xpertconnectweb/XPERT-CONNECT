/**
 * Lista las firms reales que ya están en la tabla `lawyers`,
 * agrupadas por estado y región. Útil para decidir a qué firm
 * real vincular un lawyer user nuevo.
 *
 *   npx tsx scripts/list-real-firms.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data: all } = await supabase
    .from('lawyers')
    .select('id, name, address, region, county, practice_areas, available')
    .order('name')

  if (!all || all.length === 0) {
    console.log('No firms in DB.')
    return
  }

  // Group by inferred state from address pattern ", FL " or ", MN "
  const byState: Record<string, typeof all> = {}
  for (const l of all) {
    let state = 'OTHER'
    if (/, FL /.test(l.address)) state = 'FL'
    else if (/, MN /.test(l.address)) state = 'MN'
    if (!byState[state]) byState[state] = []
    byState[state].push(l)
  }

  for (const [state, firms] of Object.entries(byState)) {
    console.log(`\n══ ${state} — ${firms.length} firm(s) ══\n`)
    // Group by region
    const byRegion: Record<string, typeof firms> = {}
    for (const f of firms) {
      const r = f.region || '(no region)'
      if (!byRegion[r]) byRegion[r] = []
      byRegion[r].push(f)
    }
    for (const [region, list] of Object.entries(byRegion)) {
      console.log(`  ▸ ${region}  (${list.length})`)
      for (const f of list.slice(0, 5)) {
        const areas = (f.practice_areas as string[] | null) ?? []
        const areaStr = areas.length ? `  [${areas.slice(0, 3).join(', ')}]` : ''
        console.log(`      • ${f.name}  → id=${f.id}${areaStr}`)
      }
      if (list.length > 5) console.log(`      ...and ${list.length - 5} more`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
