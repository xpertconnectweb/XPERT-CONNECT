import { getBodyShopSummary } from '@/lib/body-shops'
import { BodyShopDirectory } from '@/components/directory/BodyShopDirectory'
import {
  BodyShopBanner,
  BodyShopDisclaimer,
} from '@/components/directory/DirectoryBanner'

/**
 * The public Body Shops Directory, as a block in the landing feed, right
 * under the lawyers one (client request, 2026-11-09).
 *
 * The same arrangement as `LawyersDirectory`: a server component renders
 * the banner, the counts and nine shops into the HTML, and the corpus is
 * fetched only once the visitor scrolls here or touches a control. The
 * summary is computed from a file shipped with the build, so unlike the
 * lawyers block there is no database read that could fail here.
 */
export function BodyShopsDirectory() {
  const summary = getBodyShopSummary(9)

  return (
    <section id="body-shops" className="section bg-gray-50 pt-0 lg:pt-0">
      <div className="container mx-auto px-4">
        <BodyShopBanner
          total={summary.total}
          stateCount={summary.states.length}
          countyCount={summary.counties.length}
        />

        {summary.total > 0 && (
          <div className="mt-8 lg:mt-10">
            <BodyShopDirectory
              mode="preview"
              initialShops={summary.showcase}
              initialKinds={summary.kinds}
              initialStates={summary.states}
              initialCounties={summary.counties}
              total={summary.total}
            />
          </div>
        )}

        <div className="mt-8 max-w-3xl">
          <BodyShopDisclaimer />
        </div>
      </div>
    </section>
  )
}
