/**
 * Tells the live site that the lawyer directory changed.
 *
 *   npx tsx scripts/revalidate-directory.ts                    # production
 *   npx tsx scripts/revalidate-directory.ts --base=http://localhost:3000
 *
 * `scripts/directory-seed/push.ts` calls this for you. Run it by hand
 * after any OTHER change to the `lawyers` table — a row edited directly
 * in the Supabase console, `directory_public` flipped on a firm, a
 * phone number corrected. Those are database-only writes: no deploy, no
 * request to the app, and so nothing Next or the CDN can notice on
 * their own.
 *
 * This is the half of the workflow that was missing when commit ff25b9e
 * added 451 firms. Visitors kept being served the previous 176-firm
 * payload — which contained no Bradenton at all — until an unrelated
 * deploy flushed it, and the client reported the directory as broken.
 *
 * Needs DIRECTORY_REVALIDATE_SECRET, the same value set on Vercel.
 */
import { config } from 'dotenv'
import { COMPANY_DOMAIN } from '../src/lib/constants'

config({ path: '.env.local' })
config()

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

export interface RevalidateResult {
  ok: boolean
  status: number
  detail: string
}

/**
 * Resolves rather than throws, always.
 *
 * Every caller is downstream of a write that already succeeded. A
 * failure here means "the site is stale", which is worth shouting
 * about; it is never worth failing an import that has already put
 * hundreds of rows in the database.
 */
export async function revalidateDirectory(baseUrl?: string): Promise<RevalidateResult> {
  const base = (baseUrl ?? arg('base') ?? COMPANY_DOMAIN).replace(/\/$/, '')
  const secret = process.env.DIRECTORY_REVALIDATE_SECRET

  if (!secret) {
    return {
      ok: false,
      status: 0,
      detail: 'DIRECTORY_REVALIDATE_SECRET is not set in .env.local',
    }
  }

  try {
    const res = await fetch(`${base}/api/revalidate/directory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const body = await res.text()
    return {
      ok: res.ok,
      status: res.status,
      detail: res.ok ? `${base} purged` : `${res.status} ${body.slice(0, 200)}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  const result = await revalidateDirectory()
  if (result.ok) {
    console.log(`\n  ${result.detail}\n`)
    return
  }
  console.error(`\n  Revalidation failed: ${result.detail}\n`)
  process.exit(1)
}

// Only when run directly, so push.ts can import revalidateDirectory.
if (process.argv[1] && /revalidate-directory\.ts$/.test(process.argv[1])) {
  main()
}
