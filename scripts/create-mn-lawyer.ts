import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import bcrypt from 'bcryptjs'
import { requireSecret } from './script-env'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // From MN_LAWYER_PASSWORD in .env.local or --password=; no default,
  // because this repository is public.
  const hashed = await bcrypt.hash(requireSecret('MN_LAWYER_PASSWORD', 'password'), 10)

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
  console.log('\n  Username: mn_lawyer')
  console.log('  Password: (the one you supplied)')
}

main()
