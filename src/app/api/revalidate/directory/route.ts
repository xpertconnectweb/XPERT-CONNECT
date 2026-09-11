import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Purges everything that reads the public lawyer directory.
 *
 * The directory is grown by `scripts/directory-seed/push.ts`, which
 * writes straight to Supabase. That is a database-only change: no
 * deploy, no request to this app, and therefore nothing that any Next
 * cache could possibly notice. Commit ff25b9e added 451 firms that way
 * — Bradenton among them — and visitors kept being served the previous
 * 176-firm payload, which contained no Bradenton at all, until an
 * unrelated deploy happened to flush it. This route is the missing
 * half of that workflow.
 *
 * Deliberately NOT an extension of ../route.ts. That one's contract is
 * a Sanity webhook with `?secret=` in the query string, and query
 * strings are written to access logs by every proxy in the path. This
 * takes the secret in an Authorization header instead.
 *
 * `src/middleware.ts` guards /professionals, /admin and /partners only,
 * so this path needs no middleware change.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.DIRECTORY_REVALIDATE_SECRET

  // A missing secret must never mean "open". Vercel deploys with a
  // partial env more often than anyone likes to admit.
  if (!secret) {
    console.error('DIRECTORY_REVALIDATE_SECRET is not set; refusing to revalidate')
    return NextResponse.json({ message: 'Not configured' }, { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (presented !== secret) {
    return NextResponse.json({ message: 'Invalid secret' }, { status: 401 })
  }

  try {
    // The tag covers both readers of the corpus: the summary the
    // landing page and /directory render at rest, and the feed route's
    // listings. See src/lib/directory-summary.ts.
    revalidateTag('lawyer-directory')

    // The tag alone does not re-render the pages that embedded the old
    // numbers into their HTML, so purge those too.
    revalidatePath('/')
    revalidatePath('/directory')

    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Directory revalidation error:', err)
    return NextResponse.json({ message: 'Error revalidating' }, { status: 500 })
  }
}
