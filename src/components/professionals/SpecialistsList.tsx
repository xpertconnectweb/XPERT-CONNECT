'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Stethoscope, MapPin } from 'lucide-react'
import { buildSearchIndex, search, toSearchDocs, type SortMode } from '@/lib/search'
import { countyLabel } from '@/lib/counties'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { EmptyState, Segmented } from '@/components/ui'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import type { DecoratedClinic } from '@/types/professionals'
import { MedicalSpecialistReferralModal } from './MedicalSpecialistReferralModal'

/** No distance to sort by without a map, so the distance mode is left out. */
const SPECIALIST_SORT = [
  { value: 'relevance', label: 'Best', 'aria-label': 'Best match' },
  { value: 'name', label: 'A–Z', 'aria-label': 'Alphabetical' },
  // NOT 'Open'. It used to say that, and Google Maps has spent fifteen years
  // teaching everyone that Open means open right now -- which this cannot
  // know, because there is no opening-hours column anywhere in the schema.
  // It orders by whether a provider is ACCEPTING REFERRALS, which is what the
  // aria-label and the panel heading have always called it.
  //
  // Not 'Available' either: that word already belongs to the filter chip
  // beside it, and a filter and an ordering sharing one word ten pixels apart
  // is a worse problem than a long label.
  { value: 'availability', label: 'Accepting', 'aria-label': 'Accepting referrals first' },
] as const

/**
 * Only a subset of the clinic record is rendered here, but `lat`/`lng`,
 * `city` and `zipCode` are still needed so the shared search core can index
 * the row (and so a placeholder at (0,0) is dropped the same way it is on the
 * map). The API returns them regardless.
 */
type ClinicOption = Pick<
  DecoratedClinic,
  'id' | 'name' | 'region' | 'county' | 'specialties' | 'lat' | 'lng' | 'available' | 'city' | 'state' | 'zipCode'
>

export function SpecialistsList() {
  const router = useRouter()
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('relevance')
  /**
   * Which specialist the user pressed Refer on.
   *
   * The button used to be `onClick={() => setReferOpen(true)}` with the clinic
   * dropped on the floor, so the modal opened with no target and asked the user
   * to pick the specialist they had just clicked.
   */
  const [referTarget, setReferTarget] = useState<ClinicOption | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/professionals/clinics')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load specialists')))
      .then((data: ClinicOption[]) => {
        if (!cancelled) setClinics(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load specialists')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Hide clinics whose only specialties are variants of "Chiropractic" —
  // they are not considered medical specialists in this product. Applied
  // before indexing so the exclusion cannot be bypassed by a search term.
  const index = useMemo(() => {
    const specialists = clinics.filter((c) => {
      if (!c.specialties || c.specialties.length === 0) return true
      return c.specialties.some((s) => !/chiroprac/i.test(s))
    })
    return buildSearchIndex(toSearchDocs(specialists, []))
  }, [clinics])

  const outcome = useMemo(
    () => search(index, query, { sort: sortMode }),
    [index, query, sortMode]
  )
  const filtered = useMemo(() => outcome.hits.map((hit) => hit.doc.source), [outcome])

  /**
   * `places={false}`: this screen has no map, so a geocoded address suggestion
   * would resolve to somewhere the user cannot be taken. Entities, specialties
   * and history are all that make sense here.
   */
  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index,
    facets: outcome.facets,
    query,
    entityHeading: 'Specialists',
    categoryHeading: 'Specialties',
    places: false,
  })

  const handleSelect = useCallback((s: Suggestion) => {
    if (s.payload.kind === 'category') setQuery(s.payload.tag)
    else if (s.payload.kind === 'recent') setQuery(s.payload.query)
    else setQuery(s.label)
    remember(s.label)
  }, [remember])

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-navy">Medical Specialists</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse clinics in your state. Click <strong>Refer</strong> to send a patient directly.
            </p>
          </div>
          {/* The same box the map uses, minus the geocoder. This screen had a
              plain input with none of its typo tolerance or suggestions. */}
          <SmartSearchBox
            className="w-full lg:w-72"
            value={query}
            onChange={setQuery}
            onSubmit={(v) => { setQuery(v); remember(v) }}
            onSelect={handleSelect}
            onRemove={(s) => forget(s.label)}
            groups={suggestionGroups}
            resultCount={filtered.length}
            aria-label="Search specialists by name, specialty or city"
            placeholder="Search by name, specialty, city..."
            data-testid="specialists-search"
          />
        </div>

        {!loading && !error && clinics.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500" data-testid="specialists-count">
              <span className="font-semibold tabular-nums text-navy">{filtered.length}</span>{' '}
              {filtered.length === 1 ? 'specialist' : 'specialists'}
            </p>
            <Segmented
              variant="track"
              options={SPECIALIST_SORT}
              value={sortMode}
              onChange={setSortMode}
              label="Order specialists by"
              data-testid="specialists-sort"
            />
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-teal-500" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title={clinics.length === 0 ? 'No specialists in your state yet' : 'No specialists match your search'}
            hint={outcome.didYouMean ? undefined : clinics.length === 0 ? undefined : 'Try a different name or specialty.'}
            data-testid="specialists-empty"
            action={
              outcome.didYouMean ? (
                <button
                  type="button"
                  onClick={() => setQuery(outcome.didYouMean!)}
                  data-testid="specialists-did-you-mean"
                  className="rounded-lg bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Did you mean <span className="italic">{outcome.didYouMean}</span>?
                </button>
              ) : query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  data-testid="specialists-clear"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Clear search
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="specialists-list">
            {filtered.map((clinic) => (
              <li key={clinic.id} data-testid="specialist-row" className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#10b981] text-white">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{clinic.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {clinic.region && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {clinic.region}
                      </span>
                    )}
                    {clinic.county && (
                      <span className="text-[11px] text-gray-400">{countyLabel(clinic.county)}</span>
                    )}
                  </div>
                  {clinic.specialties && clinic.specialties.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {clinic.specialties.slice(0, 4).map((s) => (
                        <span key={s} className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                          {s}
                        </span>
                      ))}
                      {clinic.specialties.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{clinic.specialties.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setReferTarget(clinic)}
                  aria-label={`Refer a patient to ${clinic.name}`}
                  className="self-start sm:self-center inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] to-[#10b981] px-4 py-2 text-xs font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 hover:-translate-y-px transition-all duration-200"
                >
                  <Send className="h-3.5 w-3.5" />
                  Refer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {referTarget && (
        <MedicalSpecialistReferralModal
          // Was opened with no target at all, so the modal asked the user to
          // pick the specialist they had just pressed Refer on.
          targetClinic={{
            id: referTarget.id,
            name: referTarget.name,
            specialties: referTarget.specialties ?? [],
            region: referTarget.region,
            county: referTarget.county,
          }}
          onClose={() => setReferTarget(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
