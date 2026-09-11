import { Suspense } from 'react'
import type { Metadata } from 'next'
import { COMPANY_NAME } from '@/lib/constants'
import { getDirectorySummary } from '@/lib/directory-summary'
import { DirectoryClient } from '@/components/directory/DirectoryClient'
import {
  DirectoryBanner,
  DirectoryDisclaimer,
} from '@/components/directory/DirectoryBanner'

/**
 * The full public lawyers directory.
 *
 * Lives inside the (landing) route group, so it inherits the public
 * Header, Footer and FloatingButton from that layout for free — the
 * same arrangement /privacy and /sms-terms use.
 *
 * It exists alongside the landing block for two reasons: the block is
 * capped at nine firms so it does not swallow the marketing page, and
 * a directory is the kind of thing people search for. This URL is the
 * indexable, linkable one, so it carries the <h1> and the structured
 * data while the landing section stays at <h2> beneath the hero's.
 */
export const revalidate = 3600

export const metadata: Metadata = {
  title: `Florida Lawyers Directory | ${COMPANY_NAME}`,
  description:
    'Search Florida law firms by practice area, city and county — personal injury, criminal defense, family law, immigration, estate planning and more. Free, no sign-up.',
  alternates: { canonical: '/directory' },
  openGraph: {
    title: `Florida Lawyers Directory | ${COMPANY_NAME}`,
    description:
      'Search Florida law firms by practice area, city and county. Free, no sign-up.',
    url: 'https://www.xpertconnect.com/directory',
    type: 'website',
  },
}

export default async function DirectoryPage() {
  // A larger sample than the landing block: on this URL the visitor has
  // already asked for the directory, so the page should look like one
  // before its corpus finishes loading.
  const summary = await getDirectorySummary(24)

  /**
   * Structured data for the firms rendered server-side. Only the ones
   * actually in the HTML — describing rows a crawler cannot see would
   * be marking up content that is not on the page.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Florida Lawyers Directory',
    description:
      'A directory of Florida law firms, searchable by practice area, city and county.',
    url: 'https://www.xpertconnect.com/directory',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: summary.showcase.length,
      itemListElement: summary.showcase.map((firm, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'LegalService',
          name: firm.name,
          telephone: firm.phone || undefined,
          url: firm.website || undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: firm.address,
            addressLocality: firm.city || undefined,
            addressRegion: 'FL',
            postalCode: firm.zipCode || undefined,
            addressCountry: 'US',
          },
        },
      })),
    },
  }

  return (
    <div className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <DirectoryBanner
          as="h1"
          total={summary.total}
          areaCount={summary.counts.length}
          countyCount={summary.counties.length}
        />

        {summary.total > 0 ? (
          <div className="mt-8 lg:mt-10">
            {/**
             * `DirectoryClient` reads the query string, which makes its
             * subtree dynamic. The boundary keeps that contained: the
             * banner, the sample and the JSON-LD above and below still
             * prerender under this page's `revalidate`.
             */}
            <Suspense
              fallback={
                <div className="h-96 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
              }
            >
              <DirectoryClient
                mode="full"
                initialFirms={summary.showcase}
                initialCounts={summary.counts}
                initialCounties={summary.counties}
                total={summary.total}
                catalog={summary.catalog}
              />
            </Suspense>
          </div>
        ) : (
          <p className="mt-8 text-sm text-gray-500">
            The directory is temporarily unavailable. Please try again shortly.
          </p>
        )}

        <div className="mt-10 max-w-3xl">
          <DirectoryDisclaimer />
        </div>
      </div>

      {summary.showcase.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </div>
  )
}
