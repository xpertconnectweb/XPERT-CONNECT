'use client'

import { useState } from 'react'
import {
  ArrowLeft, Building2, Check, Copy, ExternalLink, MapPin, Phone, Scale, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canRefer, canReferNow, referLabel } from '@/lib/map/referral-policy'
import type { MapItem } from '@/lib/map/types'

/**
 * Everything known about one provider, and the four things you can do with it.
 *
 * The result row is deliberately compact — ninety-six fixed pixels, so the list
 * can be virtualised — and four actions do not fit in it. Nor should they: a
 * list is for scanning and a detail is for deciding, and cramming the second
 * into the first is how a list stops being scannable.
 *
 * What the row could not show and this does:
 *
 *   - EVERY specialty. The row shows two and a "+3" that could not be opened,
 *     and 39% of clinics have more than two, so the rest were unreachable.
 *   - The full street address rather than the "city, state, ZIP" fallback.
 *   - The county, which is how referral coordinators think about coverage.
 *   - The phone number, as a number and as a call.
 *
 * ── The four actions, and why these four ────────────────────────────────────
 *
 * Refer is the product's whole point and stays primary, in gold.
 *
 * Call is possible on every single record — phone is populated on 100% of the
 * 697 clinics and 179 firms. On a phone it turns "find the nearest clinic" into
 * "find it and ring it" without leaving the list.
 *
 * Copy is for the message somebody is about to write in another window. The
 * panel already has a copy-the-whole-list button; this is the same idea at the
 * scale people actually need.
 *
 * Website is conditional and always will be: 52% of clinics have one and
 * exactly one of the 179 firms does. A layout that assumed it would leave a
 * hole on half the screens.
 *
 * ── No photos, hours, ratings or travel time ────────────────────────────────
 *
 * None of them exist. `MapItem` has no field for any of it, and travel time
 * would need a routing service — which breaks the CSP and the commitment that
 * a client's home coordinates never leave our own origin. Straight-line
 * distance is what this can honestly say, so it is what it says.
 */
export function ProviderDetail({
  item,
  onBack,
  onRefer,
  userRole,
}: {
  item: MapItem
  onBack: () => void
  onRefer?: (item: MapItem) => void
  userRole?: string
}) {
  const [copied, setCopied] = useState(false)

  const isClinic = item.type === 'clinic'
  const Icon = isClinic ? Building2 : Scale
  const tags = (isClinic ? item.specialties : item.practiceAreas) ?? []
  const allowed = Boolean(onRefer) && canRefer(userRole, item)
  const actionable = Boolean(onRefer) && canReferNow(userRole, item)

  const address =
    item.address ?? [item.city, item.state, item.zipCode].filter(Boolean).join(', ')

  /**
   * Lifted from `AttorneyDirectory.copyContact` rather than reinvented,
   * including its silence on failure: the clipboard is unavailable on an
   * insecure origin and when the user has denied it, and everything it would
   * have copied is on screen either way. An error toast for "you can read it
   * right there" is noise.
   */
  const copy = async () => {
    const lines = [item.name, address, item.phone, tags.join(', ')].filter(Boolean)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* nothing worth saying */
    }
  }

  const href = item.website
    ? item.website.startsWith('http')
      ? item.website
      : `https://${item.website}`
    : null

  return (
    <div
      data-testid="map-detail"
      className="flex h-full flex-col overflow-y-auto overscroll-contain bg-white"
    >
      <div className="border-b border-gray-100 px-5 pb-4 pt-4">
        <button
          type="button"
          onClick={onBack}
          data-testid="map-detail-back"
          className="-ml-1 mb-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All results
        </button>

        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
              isClinic ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Not truncated. This is the one screen where the whole name fits,
                and a name is what somebody is about to put in a referral. */}
            <h2 className="font-heading text-[17px] font-bold leading-tight text-navy">
              {item.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-semibold',
                  item.available ? 'text-emerald-600' : 'text-gray-400'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    item.available ? 'bg-emerald-500' : 'bg-gray-300'
                  )}
                />
                {item.available ? 'Accepting referrals' : 'Not accepting referrals'}
              </span>
              {item.distance > 0 && (
                <span className="tabular-nums text-gray-500">
                  {item.distance.toFixed(1)} mi away
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-5 py-4">
        {allowed && (
          <button
            type="button"
            onClick={() => onRefer?.(item)}
            disabled={!actionable}
            data-testid="map-detail-refer"
            aria-label={`Refer a patient to ${item.name}`}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {actionable ? referLabel(userRole) : 'Not accepting referrals'}
          </button>
        )}

        {item.phone && (
          <a
            href={`tel:${item.phone.replace(/[^\d+]/g, '')}`}
            data-testid="map-detail-call"
            aria-label={`Call ${item.name} on ${item.phone}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-navy transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{item.phone}</span>
          </a>
        )}

        <button
          type="button"
          onClick={copy}
          data-testid="map-detail-copy"
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-navy transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
            !item.phone && 'col-span-2'
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy details'}
        </button>
      </div>

      <div className="space-y-4 border-t border-gray-100 px-5 py-4">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
          <div className="min-w-0 text-[12px] leading-relaxed text-gray-600">
            <p>{address}</p>
            {item.county && (
              <p className="mt-0.5 text-[11px] text-gray-400">{item.county} County</p>
            )}
          </div>
        </div>

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="map-detail-website"
            className="inline-flex items-center gap-2 text-[12px] font-semibold text-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <ExternalLink className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            Visit website
          </a>
        )}

        {tags.length > 0 && (
          <div>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {isClinic ? 'Specialties' : 'Practice areas'}
            </h3>
            {/* All of them. The row shows two and a "+N" nobody could open. */}
            <div className="flex flex-wrap gap-1.5" data-testid="map-detail-tags">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium',
                    isClinic ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
