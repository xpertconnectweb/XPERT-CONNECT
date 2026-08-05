import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getLawyers, getLawyersByState, getUserById } from '@/lib/data'
import { sanitizePracticeAreas } from '@/lib/practice-areas'

export const dynamic = 'force-dynamic'

/**
 * Lawyer feed for the legal-directory portal.
 *
 * Deliberately NOT the same contract as /api/professionals/lawyers,
 * which strips `phone` and `address` so clinics and attorneys cannot
 * route around the platform. A directory whose entries cannot be
 * called is useless, so this route returns the full record — and it is
 * gated to the `directory` role (plus admin) precisely so that
 * decision stays scoped to accounts created for it.
 *
 * Do not "fix" this by copying the sanitize line from the professionals
 * route; tests/api/directory-lawyers.test.ts asserts phone and address
 * are present.
 *
 * Filtering by practice area happens client-side: the practice-area
 * cards need live counts for every area at once, so a `?area=` filter
 * would just force extra round-trips. Revisit if the network grows
 * past a few thousand firms, at which point `.contains('practice_areas',
 * [...])` plus a GIN index becomes worthwhile.
 */
export async function GET() {
  const { session, error } = await requireAuth(['directory', 'admin'])
  if (error) return error

  try {
    // Always read the user's current state from DB (JWT may be stale)
    let userState: string | undefined
    try {
      const dbUser = await getUserById(session.user.id)
      userState = dbUser?.state
    } catch {
      userState = session.user.state
    }

    const lawyers = userState
      ? await getLawyersByState(userState)
      : await getLawyers()

    // Canonicalize casing/synonyms and drop known junk, but keep any
    // custom area an admin defined in /admin/settings — the write path
    // in /api/admin/lawyers applies exactly the same rule.
    const normalized = lawyers.map((lawyer) => ({
      ...lawyer,
      practiceAreas: sanitizePracticeAreas(lawyer.practiceAreas),
    }))

    return NextResponse.json(normalized, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('Directory lawyers API error:', err)
    return NextResponse.json({ error: 'Failed to fetch lawyers' }, { status: 500 })
  }
}
