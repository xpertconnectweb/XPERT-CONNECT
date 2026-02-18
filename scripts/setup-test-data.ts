import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('🔧 Setting up test data...\n')

  try {
    // Hash passwords
    const adminPassword = await bcrypt.hash('XpertAdmin2026!', 10)
    const lawyerPassword = await bcrypt.hash('Alex123456', 10)
    const clinicPassword = await bcrypt.hash('Florida123', 10)

    // 1. Delete all referrals
    console.log('📝 Cleaning referrals...')
    await supabase.from('referrals').delete().gte('id', '')
    console.log('✅ Referrals cleaned\n')

    // 2. Delete all contacts
    console.log('📝 Cleaning contacts...')
    await supabase.from('contacts').delete().gte('id', 0)
    console.log('✅ Contacts cleaned\n')

    // 3. Delete all newsletter subscribers
    console.log('📝 Cleaning newsletter subscribers...')
    await supabase.from('newsletter_subscribers').delete().gte('email', '')
    console.log('✅ Newsletter cleaned\n')

    // 4. Delete all clinics
    console.log('📝 Cleaning clinics...')
    await supabase.from('clinics').delete().gte('id', '')
    console.log('✅ Clinics cleaned\n')

    // 5. Delete ALL users (we'll recreate admin too)
    console.log('📝 Cleaning all users...')
    await supabase.from('users').delete().gte('id', '')
    console.log('✅ All users cleaned\n')

    // 6. Create ADMIN user
    const adminId = randomUUID()
    console.log('👤 Creating admin user...')
    const { error: adminError } = await supabase
      .from('users')
      .insert({
        id: adminId,
        username: 'admin_xpert',
        email: 'admin@xpertconnect.com',
        name: 'Xpert Connect Admin',
        role: 'admin',
        password: adminPassword
      })

    if (adminError) throw adminError
    console.log('✅ Admin created: admin_xpert / XpertAdmin2026!\n')

    // 7. Create test clinic entry in clinics table
    const clinicId = randomUUID()
    console.log('🏥 Creating clinic entry...')
    const { error: clinicEntryError } = await supabase
      .from('clinics')
      .insert({
        id: clinicId,
        name: 'Florida Injury Centers - Port Charlotte',
        address: '123 Medical Plaza, Port Charlotte, FL 33952',
        lat: 26.9761,
        lng: -82.0905,
        phone: '+1 (941) 555-0456',
        email: 'clinic@florida-injury.com',
        specialties: ['Chiropractic', 'Physical Therapy', 'Pain Management'],
        region: 'Southwest Florida',
        county: 'Charlotte',
        available: true
      })

    if (clinicEntryError) throw clinicEntryError
    console.log('✅ Clinic entry created\n')

    // 8. Create clinic USER account
    const clinicUserId = randomUUID()
    console.log('🏥 Creating clinic user account...')
    const { error: clinicUserError } = await supabase
      .from('users')
      .insert({
        id: clinicUserId,
        username: 'Florida_Centers',
        email: 'clinic@florida-injury.com',
        name: 'Florida Injury Centers - Port Charlotte',
        role: 'clinic',
        clinic_id: clinicId,
        password: clinicPassword
      })

    if (clinicUserError) throw clinicUserError
    console.log('✅ Clinic user created: Florida_Centers / Florida123\n')

    // 9. Create test lawyer
    const lawyerId = randomUUID()
    console.log('👨‍⚖️ Creating lawyer user...')
    const { error: lawyerError } = await supabase
      .from('users')
      .insert({
        id: lawyerId,
        username: 'alex_rodriguez',
        email: 'joselaurasilvera@gmail.com',
        name: 'Alex Rodriguez',
        role: 'lawyer',
        firm_name: 'Rodriguez & Associates Law Firm',
        password: lawyerPassword
      })

    if (lawyerError) throw lawyerError
    console.log('✅ Lawyer created: alex_rodriguez / Alex123456\n')

    // 10. Create a sample referral
    const referralId = randomUUID()
    console.log('📄 Creating sample referral...')
    const { error: referralError } = await supabase
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

    if (referralError) throw referralError
    console.log('✅ Sample referral created\n')

    console.log('🎉 Test data setup completed successfully!\n')
    console.log('📊 Summary:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  👤 ADMIN')
    console.log('     Username: admin_xpert')
    console.log('     Password: XpertAdmin2026!')
    console.log('')
    console.log('  👨‍⚖️  LAWYER')
    console.log('     Email: joselaurasilvera@gmail.com')
    console.log('     Username: alex_rodriguez')
    console.log('     Password: Alex123456')
    console.log('     Name: Alex Rodriguez')
    console.log('     Firm: Rodriguez & Associates Law Firm')
    console.log('')
    console.log('  🏥 CLINIC')
    console.log('     Email: clinic@florida-injury.com')
    console.log('     Username: Florida_Centers')
    console.log('     Password: Florida123')
    console.log('     Name: Florida Injury Centers - Port Charlotte')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
