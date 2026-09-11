import { NextResponse } from 'next/server'
import { getPublicDirectoryListings } from '@/lib/directory-summary'

/**
 * The lawyers feed for the PUBLIC directory.
 *
 * Unauthenticated on purpose, and the only read route in this project
 * that is. `src/middleware.ts` guards /professionals, /admin and
 * /partners only, so this path is reachable by anyone — which is the
 * whole feature. What is not open is the data: `getPublicDirectoryLawyers`
 * filters on `directory_public` AND re-derives membership from
 * users.lawyer_id on every read, so the firm record of an attorney who
 * signed up here cannot appear, even if the flag on their row is stale.
 *
 * This is the third contract over the same table, and the three disagree
 * on purpose. Do not harmonise them:
 *
 *   /api/professionals/lawyers  strips phone + address (toPublicLawyer)
 *                               so a clinic cannot route around us.
 *   /api/directory/lawyers      full record, role-gated to 'directory',
 *                               and `private, no-store` because it is
 *                               scoped to the caller's state.
 *   this route                  contact details, but only for firms
 *                               whose contact details were already
 *                               public — and one document for the whole
 *                               world, hence the shared cache.
 *
 * tests/api/public-lawyers.test.ts pins the shape both ways: phone and
 * address present, geocode bookkeeping and email absent.
 *
 * ── On caching, which is what broke here ──
 *
 * The handler stays dynamic and the DATA is cached, by
 * `getPublicDirectoryListings` under the `lawyer-directory` tag. The
 * obvious-looking alternative — `export const revalidate` on the route
 * — is a trap: Next would then cache whatever this returns, including
 * the empty array below, so one transient Supabase error during a
 * revalidation would pin an empty directory for an hour. That is a
 * worse version of the bug this is here to fix.
 *
 * So the two layers have two different jobs. `revalidateTag` makes the
 * ORIGIN correct the instant an importer finishes, and the short
 * `s-maxage` below bounds how long an edge copy can disagree with it.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const listings = await getPublicDirectoryListings()

    return NextResponse.json(listings, {
      headers: {
        // Identical for every visitor, so it belongs on the CDN — but a
        // far shorter window than the day this used to hold
        // (s-maxage=3600 + stale-while-revalidate=86400). The number
        // that matters is not "how often does the directory change", it
        // is "how long can an edge copy outlive a purge it never heard
        // about" — a manual row edit in Supabase, an admin flipping
        // directory_public, an importer run where the purge call
        // failed. Five minutes caps that at fifteen instead of at a day.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    // An empty array rather than a 500: the directory degrades to its
    // server-rendered sample instead of showing an error banner on the
    // marketing page. Explicitly NOT cached, so the next request retries
    // rather than serving the failure for an hour.
    console.error('Public lawyers API error:', err)
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
