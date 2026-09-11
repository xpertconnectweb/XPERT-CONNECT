'use client'

import { Scale, MapPin, Phone, Copy, Check, Globe, Star } from 'lucide-react'
import { countyLabel } from '@/lib/counties'

/**
 * The shape a row needs, structurally — satisfied by both
 * `DecoratedLawyer` (the gated directory) and `DirectoryListing` (the
 * public one) without either having to know about the other.
 */
export interface FirmRowData {
  id: string
  name: string
  address: string
  phone: string
  practiceAreas: string[]
  /** On a lawyer row this holds a CITY name, not a region. */
  region?: string
  city?: string | null
  county?: string
  website?: string
  available?: boolean
}

/**
 * One firm in a directory list.
 *
 * Extracted from AttorneyDirectory; the markup is that original's,
 * down to `data-testid="attorney-row"`, so the gated directory renders
 * exactly what it always did and its e2e spec keeps passing.
 *
 * The two variations exist because the public directory is not the
 * network:
 *
 *   `showAvailability` — the green dot means "accepting referrals".
 *     True of a firm that signed up; a claim nobody made on behalf of a
 *     firm we found in a public listing. Off in public.
 *   `onCopy` — copying a contact block is a professional's workflow
 *     (paste it into a referral). A visitor just taps the number.
 */
export function FirmRow({
  firm,
  showAvailability = false,
  copied = false,
  onCopy,
  featured = false,
}: {
  firm: FirmRowData
  showAvailability?: boolean
  copied?: boolean
  onCopy?: (firm: FirmRowData) => void
  /**
   * Pinned to the top by editorial choice rather than by relevance.
   *
   * It renders a label because it has to: a firm in Bradenton sitting
   * above the results for "Miami" is either explained or it looks like
   * the search is broken.
   */
  featured?: boolean
}) {
  const city = firm.region || firm.city || ''

  return (
    <li
      data-testid="attorney-row"
      data-featured={featured ? 'true' : undefined}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 transition-colors ${
        featured ? 'bg-gold/[0.06] hover:bg-gold/10' : 'hover:bg-gray-50/50'
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-light text-gold">
        <Scale className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 text-sm truncate">{firm.name}</p>
          {featured && (
            <span
              data-testid="firm-featured-badge"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-dark"
            >
              <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              Featured
            </span>
          )}
          {showAvailability && (
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                firm.available ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
              title={firm.available ? 'Accepting referrals' : 'Not accepting referrals'}
            />
          )}
        </div>

        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{firm.address}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          {city && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
              <MapPin className="h-3 w-3" />
              {city}
            </span>
          )}
          {firm.county && (
            <span className="text-[11px] text-gray-400">{countyLabel(firm.county)}</span>
          )}
        </div>

        {firm.practiceAreas.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {firm.practiceAreas.slice(0, 4).map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold-dark"
              >
                {a}
              </span>
            ))}
            {firm.practiceAreas.length > 4 && (
              <span className="text-[10px] text-gray-400">
                +{firm.practiceAreas.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        {firm.phone && (
          <a
            href={`tel:${firm.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-4 py-2 text-xs font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 hover:-translate-y-px transition-all duration-200"
          >
            <Phone className="h-3.5 w-3.5" />
            {firm.phone}
          </a>
        )}

        {firm.website && (
          <a
            href={firm.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`Visit the website of ${firm.name}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            Website
          </a>
        )}

        {onCopy && (
          <button
            type="button"
            onClick={() => onCopy(firm)}
            aria-label={`Copy contact details for ${firm.name}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        )}
      </div>
    </li>
  )
}
