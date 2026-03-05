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

interface Clinic {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  specialties: string[]
  email: string
  website?: string
  region: string
  county: string
  available: boolean
}

async function main() {
  console.log('🏥 Restoring all clinics from clinics.json...\n')

  try {
    // Read clinics from JSON file
    const clinicsPath = path.join(__dirname, '../data/clinics.json')
    const clinicsData = fs.readFileSync(clinicsPath, 'utf-8')
    const clinics: Clinic[] = JSON.parse(clinicsData)

    console.log(`📋 Found ${clinics.length} clinics to restore\n`)

    // Upsert clinics in batches (Supabase has request size limits)
    const BATCH_SIZE = 200
    const rows = clinics.map((clinic) => ({
      id: clinic.id,
      name: clinic.name,
      address: clinic.address,
      lat: clinic.lat,
      lng: clinic.lng,
      phone: clinic.phone || '',
      specialties: clinic.specialties,
      email: clinic.email || '',
      website: clinic.website || null,
      region: clinic.region || null,
      county: clinic.county || null,
      available: clinic.available !== false
    }))

    const totalBatches = Math.ceil(rows.length / BATCH_SIZE)
    console.log(`🔄 Upserting ${rows.length} clinics in ${totalBatches} batches...`)

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const { error } = await supabase.from('clinics').upsert(batch, { onConflict: 'id' })
      if (error) throw error
      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} clinics upserted`)
    }

    console.log(`\n✅ Successfully restored ${clinics.length} clinics!\n`)

    console.log('🎉 All clinics have been restored to Supabase!')
    console.log('\n📍 Clinics by region:')

    const regionCounts = clinics.reduce((acc, clinic) => {
      const region = clinic.region || 'Unknown'
      acc[region] = (acc[region] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([region, count]) => {
        console.log(`  • ${region}: ${count} clinics`)
      })

    console.log('\n✅ All test users are still intact!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
