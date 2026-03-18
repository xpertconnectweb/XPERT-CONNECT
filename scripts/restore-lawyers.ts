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

async function main() {
  console.log('⚖️  Restoring all lawyers from lawyers.json...\n')

  try {
    const lawyersPath = path.join(__dirname, '../data/lawyers.json')
    const lawyersData = fs.readFileSync(lawyersPath, 'utf-8')
    const lawyers: Lawyer[] = JSON.parse(lawyersData)

    console.log(`📋 Found ${lawyers.length} lawyers to restore\n`)

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
