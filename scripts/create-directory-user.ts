/**
 * Creates the Legal Directory account (role `directory`).
 *
 * Requires scripts/migrations/2026-08-directory-role.sql to have been
 * applied — until then `users_role_check` rejects the insert.
 *
 * The password comes from DIRECTORY_USER_PASSWORD in .env.local or
 * --password=; there is no default, because this repository is public.
 *
 *   npx tsx scripts/create-directory-user.ts
 *   npx tsx scripts/create-directory-user.ts --username=x --password=y --state=MN
 *
 * Idempotent: if the username already exists it reports the row and
 * exits 0 without touching the password.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { arg, requireSecret } from './script-env'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USERNAME = arg('username', 'directory1')
const PASSWORD = requireSecret('DIRECTORY_USER_PASSWORD', 'password')
const NAME = arg('name', 'Legal Directory')
const EMAIL = arg('email', 'directory@844xpert.com')
// Without a state the map opens at national zoom on an empty viewport.
const STATE = arg('state', 'FL')

async function main() {
  const { data: existing } = await supabase
    .from('users')
    .select('id, name, username, role, email, state')
    .eq('username', USERNAME)
    .maybeSingle()

  if (existing) {
    console.log(`User "${USERNAME}" already exists — nothing to do:`)
    console.log(existing)
    if (existing.role !== 'directory') {
      console.warn(
        `\n⚠ Its role is "${existing.role}", not "directory". Fix it in /admin/users or pass --username=<other>.`
      )
      process.exit(1)
    }
    return
  }

  const password = await bcrypt.hash(PASSWORD, 10)

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: `directory-${randomUUID().slice(0, 8)}`,
      name: NAME,
      username: USERNAME,
      password,
      role: 'directory',
      email: EMAIL,
      state: STATE,
    })
    .select('id, name, username, role, email, state')
    .single()

  if (error) {
    console.error('Error creating user:', error)
    if (/users_role_check/.test(error.message ?? '')) {
      console.error(
        '\n→ The role CHECK constraint still rejects "directory".',
        '\n  Apply scripts/migrations/2026-08-directory-role.sql first.'
      )
    }
    process.exit(1)
  }

  console.log('Legal Directory user created successfully:')
  console.log(data)
  console.log(`\n  Username: ${USERNAME}`)
  console.log('  Password: (the one you supplied)')
  console.log('\nLogin at /professionals/login → lands on /professionals/attorneys')
}

main()
