import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import bcrypt from 'bcryptjs'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const password = 'Xpert2026!'
  const hashed = await bcrypt.hash(password, 10)

  const user = {
    id: 'lawyer-mn-001',
    username: 'mn_lawyer',
    password: hashed,
    name: 'Minnesota Attorney',
    role: 'lawyer',
    email: 'mn.lawyer@xpertconnect.com',
    firm_name: 'MN Legal Group',
    state: 'MN',
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(user, { onConflict: 'id' })
    .select('id, username, name, role, state')
    .single()

  if (error) {
    console.error('Error creating user:', error.message)
    process.exit(1)
  }

  console.log('User created successfully:')
  console.log(data)
  console.log('\nCredentials:')
  console.log(`  Username: mn_lawyer`)
  console.log(`  Password: ${password}`)
}

main()
