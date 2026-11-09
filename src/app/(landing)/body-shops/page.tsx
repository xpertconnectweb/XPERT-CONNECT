import { Suspense } from 'react'
import type { Metadata } from 'next'
import { COMPANY_NAME } from '@/lib/constants'
import { getBodyShopSummary } from '@/lib/body-shops'
import { BodyShopDirectoryClient } from '@/components/directory/BodyShopDirectoryClient'
import { jsonForScript } from '@/lib/security/url'
import {
  BodyShopBanner,
  BodyShopDisclaimer,
} from '@/components/directory/DirectoryBanner'

/**
 * The full public Body Shops Directory, the sibling of /directory.
 *
 * Inside the (landing) route group for the public Header and Footer. The
 * landing block shows nine shops and links here; this URL carries the <h1>
 * and the structured data.
 */
export const revalidate = 3600

const TITLE = `Body Shops Directory — Florida & Minnesota | ${COMPANY_NAME}`
const DESCRIPTION =
  'Find collision, auto body and paint shops in Florida and Minnesota — independent shops and the major chains, each verified against an official source. Free, no sign-up.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/body-shops' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.xpertconnect.com/body-shops',
    type: 'website',
  },
}

export default function BodyShopsPage() {
  const summary = getBodyShopSummary(24)

  /** Only the shops actually in the HTML; no telephone or street, which the listing withholds. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Body Shops Directory',
    description: 'A directory of collision, auto body and paint shops in Florida and Minnesota.',
    url: 'https://www.xpertconnect.com/body-shops',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: summary.showcase.length,
      itemListElement: summary.showcase.map((shop, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'AutoBodyShop',
          name: shop.name,
          address: {
            '@type': 'PostalAddress',
            addressLocality: shop.city,
            addressRegion: shop.state,
            postalCode: shop.zipCode || undefined,
            addressCountry: 'US',
          },
        },
      })),
    },
  }

  return (
    <div className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <BodyShopBanner
          as="h1"
          total={summary.total}
          stateCount={summary.states.length}
          countyCount={summary.counties.length}
        />

        <div className="mt-8 lg:mt-10">
          <Suspense
            fallback={
              <div className="h-96 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
            }
          >
            <BodyShopDirectoryClient
              mode="full"
              initialShops={summary.showcase}
              initialKinds={summary.kinds}
              initialStates={summary.states}
              initialCounties={summary.counties}
              total={summary.total}
            />
          </Suspense>
        </div>

        <div className="mt-10 max-w-3xl">
          <BodyShopDisclaimer />
        </div>
      </div>

      {summary.showcase.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForScript(jsonLd) }}
        />
      )}
    </div>
  )
}
