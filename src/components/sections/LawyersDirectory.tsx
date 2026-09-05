import { getDirectorySummary } from '@/lib/directory-summary'
import { PublicDirectory } from '@/components/directory/PublicDirectory'
import {
  DirectoryBanner,
  DirectoryDisclaimer,
} from '@/components/directory/DirectoryBanner'

/**
 * The public lawyers directory, as a block in the landing feed.
 *
 * A server component: the banner, the practice-area counts and the first
 * few firms are in the HTML, so the section is populated before any
 * fetch and before hydration — which is also what a screenshot of the
 * page at rest shows, and what a visitor with JavaScript off gets.
 *
 * The corpus itself is not here. `PublicDirectory` fetches it only once
 * the visitor scrolls this section into view or touches a control, so
 * the site's front door does not pay for a thousand firms it may never
 * search. See the comment on `load` in that file.
 *
 * `getDirectorySummary` swallows its own errors and returns an empty
 * summary, so a database outage costs this one section rather than the
 * whole marketing page.
 */
export async function LawyersDirectory() {
  const summary = await getDirectorySummary(9)

  return (
    <section id="directory" className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <DirectoryBanner
          total={summary.total}
          areaCount={summary.counts.length}
          countyCount={summary.counties.length}
        />

        {summary.total > 0 && (
          <div className="mt-8 lg:mt-10">
            <PublicDirectory
              mode="preview"
              initialFirms={summary.showcase}
              initialCounts={summary.counts}
              initialCounties={summary.counties}
              total={summary.total}
              catalog={summary.catalog}
            />
          </div>
        )}

        <div className="mt-8 max-w-3xl">
          <DirectoryDisclaimer />
        </div>
      </div>
    </section>
  )
}
