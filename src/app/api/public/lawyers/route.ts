import { NextResponse } from 'next/server'
import { getPublicDirectoryLawyers } from '@/lib/data'
import { toDirectoryListings } from '@/lib/api/public-shape'
import { sanitizePracticeAreas } from '@/lib/practice-areas'

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
 *                               world, hence the long shared cache.
 *
 * tests/api/public-lawyers.test.ts pins the shape both ways: phone and
 * address present, geocode bookkeeping and email absent.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const lawyers = await getPublicDirectoryLawyers()

    // Same canonicalization the gated route applies, for the same
    // reason: the practice-area cards key off these strings, and a
    // stray 'criminal defence' would render as its own category.
    const listings = toDirectoryListings(lawyers).map((listing) => ({
      ...listing,
      practiceAreas: sanitizePracticeAreas(listing.practiceAreas),
    }))

    return NextResponse.json(listings, {
      headers: {
        // Identical for every visitor and changes only when someone
        // re-runs the importer, so it belongs on the CDN. The stale
        // window means a cold revalidate never blocks a search.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
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
