import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const password = await bcrypt.hash('Referrer2026', 10)

  const { data, error } = await supabase.from('users').insert({
    id: `referrer-${randomUUID().slice(0, 8)}`,
    name: 'Referrer Partner',
    username: 'referrer1',
    password,
    role: 'referrer',
    email: 'referrer@844xpert.com',
  }).select('id, name, username, role, email').single()

  if (error) {
    console.error('Error creating user:', error)
    process.exit(1)
  }

  console.log('Referrer user created successfully:')
  console.log(data)
  console.log('\nCredentials:')
  console.log('  Username: referrer1')
  console.log('  Password: Referrer2026')
}

main()
