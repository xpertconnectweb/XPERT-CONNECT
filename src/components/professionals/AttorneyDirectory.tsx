'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Scale, FilterX } from 'lucide-react'
import { buildSearchIndex, search, toSearchDocs } from '@/lib/search'
import type { SearchFilters, SortMode } from '@/lib/search'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { EmptyState, Segmented } from '@/components/ui'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { countyLabel } from '@/lib/counties'
import type { DecoratedLawyer } from '@/types/professionals'
import { PracticeAreaCards } from '@/components/directory/PracticeAreaCards'
import { FirmRow } from '@/components/directory/FirmRow'

/** No distance without a map, so that mode is left out. */
const DIRECTORY_SORT = [
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

export function AttorneyDirectory({ catalog }: { catalog: string[] }) {
  const [lawyers, setLawyers] = useState<DecoratedLawyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [county, setCounty] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('relevance')

  useEffect(() => {
    let cancelled = false
    fetch('/api/directory/lawyers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load attorneys'))))
      .then((data: DecoratedLawyer[]) => {
        if (!cancelled) setLawyers(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attorneys')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const countyOptions = useMemo(() => {
    const set = new Set<string>()
    lawyers.forEach((l) => l.county && set.add(l.county))
    return Array.from(set).sort()
  }, [lawyers])

  // Card counts are scoped by county but NOT by the search box, so
  // typing never collapses the category grid out from under the user.
  const scoped = useMemo(
    () => (county ? lawyers.filter((l) => l.county === county) : lawyers),
    [lawyers, county]
  )

  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>()
    scoped.forEach((l) =>
      l.practiceAreas.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    )
    return counts
  }, [scoped])

  const visibleAreas = useMemo(
    () => catalog.filter((a) => (areaCounts.get(a) ?? 0) > 0 || a === area),
    [catalog, areaCounts, area]
  )

  // Built once per fetch, not per keystroke: tokenizing 176 firms costs more
  // than the search itself.
  const index = useMemo(() => buildSearchIndex(toSearchDocs([], lawyers)), [lawyers])

  const outcome = useMemo(() => {
    const filters: SearchFilters = {}
    if (area) filters.tags = [area]
    if (county) filters.counties = [county]
    return search(index, query, { filters, sort: sortMode })
  }, [index, query, area, county, sortMode])

  const filtered = useMemo(() => outcome.hits.map((hit) => hit.doc.source), [outcome])

  /**
   * `places={false}`: no map on this screen, so a geocoded address would
   * resolve to somewhere the user cannot be taken.
   */
  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index,
    facets: outcome.facets,
    query,
    entityHeading: 'Firms',
    categoryHeading: 'Practice areas',
    places: false,
  })

  const handleSelect = useCallback((sug: Suggestion) => {
    if (sug.payload.kind === 'category') setArea(sug.payload.tag)
    else if (sug.payload.kind === 'recent') setQuery(sug.payload.query)
    else setQuery(sug.label)
    remember(sug.label)
  }, [remember])

  const hasActiveFilters = Boolean(area || county || query)

  const clearFilters = () => {
    setArea('')
    setCounty('')
    setQuery('')
  }

  const copyContact = async (lawyer: DecoratedLawyer) => {
    const lines = [lawyer.name, lawyer.address, lawyer.phone, lawyer.practiceAreas.join(', ')]
    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
      setCopiedId(lawyer.id)
      setTimeout(() => setCopiedId((id) => (id === lawyer.id ? null : id)), 1800)
    } catch {
      // Clipboard is unavailable (insecure origin / denied) — the phone
      // number is already visible as a tel: link, so fail quietly.
    }
  }

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-navy">Attorneys</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse the legal network by practice area. Pick a category, then call the firm directly.
            </p>
          </div>
          <SmartSearchBox
            className="w-full lg:w-72"
            value={query}
            onChange={setQuery}
            onSubmit={(v) => { setQuery(v); remember(v) }}
            onSelect={handleSelect}
            onRemove={(sug) => forget(sug.label)}
            groups={suggestionGroups}
            resultCount={filtered.length}
            aria-label="Search attorneys by firm, city or county"
            placeholder="Search by firm, city, county..."
            data-testid="directory-search"
          />
        </div>
      </div>

      {/* Practice-area cards — the "types of lawyer" view */}
      {!loading && !error && (
        <PracticeAreaCards
          areas={visibleAreas}
          counts={areaCounts}
          selected={area}
          onSelect={setArea}
        />
      )}

      {/* Secondary filters + result count */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white shadow-sm border border-gray-200/80 px-5 py-3.5">
          <select
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10"
          >
            <option value="">All counties ({countyOptions.length})</option>
            {countyOptions.map((c) => (
              <option key={c} value={c}>
                {/* Stored bare so it matches the clinics table; rendered with
                    the suffix, which is how people read a county name. */}
                {countyLabel(c)}
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-500">
            <strong className="text-gray-900" data-testid="directory-result-count">
              {filtered.length}
            </strong>{' '}
            of {lawyers.length} firms
            {area && <span className="text-gray-400"> · {area}</span>}
          </span>

          {/* Same control as the map panel and the specialists list. Ordering a
              directory alphabetically is the obvious thing to want from one,
              and it was implemented in the engine all along. */}
          <Segmented
            className="ml-auto"
            variant="track"
            options={DIRECTORY_SORT}
            value={sortMode}
            onChange={setSortMode}
            label="Order firms by"
            data-testid="directory-sort"
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <FilterX className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={lawyers.length === 0 ? 'No attorneys in your state yet' : 'No firms match these filters'}
            hint={outcome.didYouMean || hasActiveFilters ? undefined : 'Try a different firm, city or county.'}
            data-testid="directory-empty"
            action={
              outcome.didYouMean ? (
                <button
                  type="button"
                  onClick={() => setQuery(outcome.didYouMean!)}
                  data-testid="directory-did-you-mean"
                  className="rounded-lg bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Did you mean <span className="italic">{outcome.didYouMean}</span>?
                </button>
              ) : hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  data-testid="directory-empty-clear"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((lawyer) => (
              <FirmRow
                key={lawyer.id}
                firm={lawyer}
                showAvailability
                copied={copiedId === lawyer.id}
                onCopy={() => copyContact(lawyer)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
