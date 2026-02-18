import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { randomUUID } from 'crypto'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('🧹 Starting database cleanup and seeding...\n')

  try {
    // 1. Delete all referrals
    console.log('📝 Deleting all referrals...')
    const { error: refError } = await supabase.from('referrals').delete().gte('id', '')
    if (refError) throw refError
    console.log('✅ Referrals deleted\n')

    // 2. Delete all contacts
    console.log('📝 Deleting all contacts...')
    const { error: contactError } = await supabase.from('contacts').delete().gte('id', 0)
    if (contactError) throw contactError
    console.log('✅ Contacts deleted\n')

    // 3. Delete all newsletter subscribers
    console.log('📝 Deleting all newsletter subscribers...')
    const { error: newsletterError } = await supabase.from('newsletter_subscribers').delete().gte('email', '')
    if (newsletterError) throw newsletterError
    console.log('✅ Newsletter subscribers deleted\n')

    // 4. Delete all clinics
    console.log('📝 Deleting all clinics...')
    const { error: clinicsError } = await supabase.from('clinics').delete().gte('id', '')
    if (clinicsError) throw clinicsError
    console.log('✅ Clinics deleted\n')

    // 5. Delete all users except admin
    console.log('📝 Deleting all users except admin...')
    const { error: userError } = await supabase.from('users').delete().neq('role', 'admin')
    if (userError) throw userError
    console.log('✅ Users deleted (kept admin)\n')

    // 6. Create test clinic
    const clinicId = randomUUID()
    console.log('🏥 Creating test clinic...')
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert({
        id: clinicId,
        name: 'Florida Injury Centers - Port Charlotte',
        address: '123 Medical Plaza, Port Charlotte, FL 33952',
        lat: 26.9761,
        lng: -82.0905,
        phone: '+1 (941) 555-0456',
        email: 'clinic@florida-injury.com',
        specialties: JSON.stringify(['Chiropractic', 'Physical Therapy', 'Pain Management']),
        region: 'Southwest Florida',
        county: 'Charlotte',
        available: true
      })
      .select()
      .single()

    if (clinicError) throw clinicError
    console.log('✅ Test clinic created:', clinic.name, '\n')

    // 7. Create test lawyer (Attorney)
    const lawyerId = randomUUID()
    console.log('👨‍⚖️ Creating test lawyer...')
    const { data: lawyer, error: lawyerError } = await supabase
      .from('users')
      .insert({
        id: lawyerId,
        username: 'alex.rodriguez',
        email: 'joselaurasilvera@gmail.com',
        name: 'Alex Rodriguez',
        role: 'lawyer',
        firm_name: 'Rodriguez & Associates Law Firm',
        password: '$2a$10$YourHashedPasswordHere' // This is just a placeholder
      })
      .select()
      .single()

    if (lawyerError) throw lawyerError
    console.log('✅ Test lawyer created:', lawyer.name, '\n')

    // 8. Create a sample referral
    const referralId = randomUUID()
    console.log('📄 Creating sample referral...')
    const { data: referral, error: referralError} = await supabase
      .from('referrals')
      .insert({
        id: referralId,
        lawyer_id: lawyerId,
        lawyer_name: 'Alex Rodriguez',
        lawyer_firm: 'Rodriguez & Associates Law Firm',
        clinic_id: clinicId,
        clinic_name: 'Florida Injury Centers - Port Charlotte',
        patient_name: 'John Smith',
        patient_phone: '+1 (305) 555-7890',
        case_type: 'Auto Accident',
        coverage: 'PIP Available',
        pip: 'Yes - $10,000',
        notes: 'Patient experienced neck and back pain after rear-end collision. Currently seeking immediate treatment.',
        status: 'received'
      })
      .select()
      .single()

    if (referralError) throw referralError
    console.log('✅ Sample referral created\n')

    console.log('🎉 Database cleanup and seeding completed successfully!')
    console.log('\n📊 Summary:')
    console.log('  • Admin user: preserved')
    console.log('  • Test lawyer: joselaurasilvera@gmail.com (username: alex.rodriguez)')
    console.log('  • Test clinic: Florida Injury Centers - Port Charlotte')
    console.log('  • Sample referral: created')
    console.log('\n💡 You can now test sending referrals from the lawyer account!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
