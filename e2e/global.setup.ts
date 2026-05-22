import fs from 'node:fs'
import path from 'node:path'

async function globalSetup() {
  const authDir = path.resolve(process.cwd(), '.auth')
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  if (!process.env.E2E_NAMESPACE_PREFIX) {
    process.env.E2E_NAMESPACE_PREFIX = `e2e-${Date.now()}-`
  }

  const required = [
    'E2E_ADMIN_USER',
    'E2E_ADMIN_PASS',
    'E2E_LAWYER_USER',
    'E2E_LAWYER_PASS',
    'E2E_CLINIC_USER',
    'E2E_CLINIC_PASS',
    'E2E_REFERRER_USER',
    'E2E_REFERRER_PASS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `E2E missing env vars: ${missing.join(', ')}. Copy .env.test.example → .env.test and fill in.`,
    )
  }
}

export default globalSetup
