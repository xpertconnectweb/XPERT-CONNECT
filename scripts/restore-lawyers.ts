import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Lawyer {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  practiceAreas: string[]
  email: string
  website?: string
  region: string
  county: string
  zipCode: string
  available: boolean
}

const FORCE = process.argv.includes('--force')

async function main() {
  console.log('⚖️  Restoring all lawyers from lawyers.json...\n')

  try {
    const lawyersPath = path.join(__dirname, '../data/lawyers.json')
    const lawyersData = fs.readFileSync(lawyersPath, 'utf-8')
    const lawyers: Lawyer[] = JSON.parse(lawyersData)

    console.log(`📋 Found ${lawyers.length} lawyers to restore\n`)

    /**
     * `data/lawyers.json` is a snapshot of 176 firms taken before the
     * directory grew to 627 (commit ff25b9e). It is a restore point,
     * not the source of truth, and it has drifted: it predates the
     * structured-address backfill and every correction made since.
     *
     * The upsert below cannot delete the newer firms — their ids are
     * not in the file — but it will happily overwrite the name, phone,
     * coordinates and practice areas of every row that IS, rolling
     * those back to their state at the time of the snapshot. Nothing
     * about running it says that out loud, so say it here.
     */
    const { count: live } = await supabase
      .from('lawyers')
      .select('*', { count: 'exact', head: true })

    if (live !== null && live > lawyers.length && !FORCE) {
      console.error(`⛔ The live table has ${live} lawyers; this file has ${lawyers.length}.`)
      console.error('   The snapshot is older than the database. Restoring it would roll back')
      console.error(`   the ${lawyers.length} rows it contains to their state at snapshot time.`)
      console.error('   If that is genuinely what you want, re-run with --force.\n')
      process.exit(1)
    }

    const BATCH_SIZE = 200
    const rows = lawyers.map((lawyer) => ({
      id: lawyer.id,
      name: lawyer.name,
      address: lawyer.address,
      lat: lawyer.lat,
      lng: lawyer.lng,
      phone: lawyer.phone || '',
      practice_areas: lawyer.practiceAreas,
      email: lawyer.email || '',
      website: lawyer.website || null,
      region: lawyer.region || null,
      county: lawyer.county || null,
      zip_code: lawyer.zipCode || null,
      available: lawyer.available !== false
    }))

    const totalBatches = Math.ceil(rows.length / BATCH_SIZE)
    console.log(`🔄 Upserting ${rows.length} lawyers in ${totalBatches} batches...`)

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const { error } = await supabase.from('lawyers').upsert(batch, { onConflict: 'id' })
      if (error) throw error
      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} lawyers upserted`)
    }

    console.log(`\n✅ Successfully restored ${lawyers.length} lawyers!\n`)

    console.log('📍 Lawyers by region:')
    const regionCounts = lawyers.reduce((acc, lawyer) => {
      const region = lawyer.region || 'Unknown'
      acc[region] = (acc[region] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([region, count]) => {
        console.log(`  • ${region}: ${count} lawyers`)
      })

    console.log('\n🎉 All lawyers have been restored to Supabase!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
