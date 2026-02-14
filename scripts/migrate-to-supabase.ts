/**
 * Migration script: JSON files -> Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-to-supabase.ts
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Tables already created via scripts/supabase-schema.sql
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const DATA_DIR = path.join(process.cwd(), 'data')

interface JsonUser {
  id: string
  username: string
  password: string
  name: string
  role: string
  clinicId?: string
  firmName?: string
  email: string
}

interface JsonClinic {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  specialties: string[]
  email: string
  website?: string
  region?: string
  county?: string
  available: boolean
}

interface JsonReferral {
  id: string
  lawyerId: string
  lawyerName: string
  lawyerFirm: string
  clinicId: string
  clinicName: string
  patientName: string
  patientPhone: string
  caseType: string
  notes: string
  status: string
  createdAt: string
  updatedAt: string
}

async function migrate() {
  console.log('Starting migration...\n')

  // 1. Users
  const users: JsonUser[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8')
  )
  console.log(`Migrating ${users.length} users...`)
  const userRows = users.map((u) => ({
    id: u.id,
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role,
    clinic_id: u.clinicId || null,
    firm_name: u.firmName || null,
    email: u.email,
  }))
  const { error: usersError } = await supabase
    .from('users')
    .upsert(userRows, { onConflict: 'id' })
  if (usersError) {
    console.error('Users migration failed:', usersError)
  } else {
    console.log(`  ✓ ${users.length} users migrated`)
  }

  // 2. Clinics
  const clinics: JsonClinic[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'clinics.json'), 'utf-8')
  )
  console.log(`Migrating ${clinics.length} clinics...`)
  const clinicRows = clinics.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    lat: c.lat,
    lng: c.lng,
    phone: c.phone,
    specialties: c.specialties,
    email: c.email,
    website: c.website || null,
    region: c.region || null,
    county: c.county || null,
    available: c.available,
  }))
  // Upsert in batches of 100 to avoid payload limits
  for (let i = 0; i < clinicRows.length; i += 100) {
    const batch = clinicRows.slice(i, i + 100)
    const { error } = await supabase
      .from('clinics')
      .upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error(`Clinics batch ${i} failed:`, error)
    }
  }
  console.log(`  ✓ ${clinics.length} clinics migrated`)

  // 3. Referrals (depends on users + clinics)
  const referrals: JsonReferral[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'referrals.json'), 'utf-8')
  )
  console.log(`Migrating ${referrals.length} referrals...`)
  const referralRows = referrals.map((r) => ({
    id: r.id,
    lawyer_id: r.lawyerId,
    lawyer_name: r.lawyerName,
    lawyer_firm: r.lawyerFirm,
    clinic_id: r.clinicId,
    clinic_name: r.clinicName,
    patient_name: r.patientName,
    patient_phone: r.patientPhone,
    case_type: r.caseType,
    notes: r.notes,
    status: r.status,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }))
  const { error: referralsError } = await supabase
    .from('referrals')
    .upsert(referralRows, { onConflict: 'id' })
  if (referralsError) {
    console.error('Referrals migration failed:', referralsError)
  } else {
    console.log(`  ✓ ${referrals.length} referrals migrated`)
  }

  console.log('\nMigration complete!')
}

migrate().catch(console.error)
