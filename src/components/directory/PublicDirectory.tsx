'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FilterX, Scale } from 'lucide-react'
import { buildSearchIndex, search, toSearchDocs } from '@/lib/search'
import type { SearchFilters, SortMode } from '@/lib/search'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { EmptyState, Segmented } from '@/components/ui'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { countyLabel } from '@/lib/counties'
import type { DirectoryListing } from '@/types/professionals'
import { PracticeAreaCards } from './PracticeAreaCards'
import { FirmRow } from './FirmRow'

/**
 * No 'Accepting' here, unlike the gated directory.
 *
 * That option orders by whether a provider is accepting referrals — a
 * commitment a firm makes when it joins. Nobody in this list made it:
 * these are firms compiled from public sources. Offering the sort would
 * be inventing a status on their behalf, so the public control stops at
 * the two orderings that mean something to a visitor.
 */
const PUBLIC_SORT = [
  { value: 'relevance', label: 'Best', 'aria-label': 'Best match' },
  { value: 'name', label: 'A–Z', 'aria-label': 'Alphabetical' },
] as const

/** How many firms the landing-page block shows before "view all". */
const PREVIEW_LIMIT = 9

/** How many the full page renders before "show more". */
const PAGE_STEP = 60

/**
 * `available` is required by `LawyerLike` but absent from
 * `DirectoryListing` on purpose. Indexing every firm as available is
 * neutral for ranking — the engine's AVAILABILITY_BOOST multiplies every
 * score by the same constant — and nothing on this surface renders it.
 */
function indexable(firms: readonly DirectoryListing[]) {
  return firms.map((f) => ({ ...f, available: true }))
}

export interface PublicDirectoryProps {
  /**
   * Firms rendered by the server so the list is populated in the HTML —
   * before any fetch, before hydration, and in a screenshot taken
   * without touching anything.
   */
  initialFirms: DirectoryListing[]
  /**
   * Practice-area counts over the WHOLE corpus, computed server-side.
   * This is the trick that makes nine rows read as nine hundred firms:
   * the cards are honest about the full catalogue while the list is
   * still showing a sample.
   */
  initialCounts: [string, number][]
  /** Counties over the whole corpus, bare, sorted. */
  initialCounties: string[]
  total: number
  catalog: string[]
  /**
   * `preview` is the landing block: capped list, link out, and the
   * corpus fetched only once the visitor shows interest.
   * `full` is /directory, which fetches on mount — that URL *is* the
   * directory, so there is no interest left to wait for.
   */
  mode?: 'preview' | 'full'
  viewAllHref?: string
}

export function PublicDirectory({
  initialFirms,
  initialCounts,
  initialCounties,
  total,
  catalog,
  mode = 'full',
  viewAllHref = '/directory',
}: PublicDirectoryProps) {
  const [firms, setFirms] = useState<DirectoryListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [county, setCounty] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('relevance')
  const [limit, setLimit] = useState(PAGE_STEP)

  const requested = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  /**
   * The whole corpus in one request, indexed in the browser — the same
   * shape the gated directory uses, and fine at this size: a search over
   * a thousand firms is single-digit milliseconds.
   *
   * What is NOT fine is paying for it on first paint of the landing
   * page, which is the site's front door. So the block ships nine
   * server-rendered rows and defers the payload until the visitor
   * scrolls it into view or touches a control. The ref guard means that
   * happens exactly once however many triggers fire.
   */
  const load = useCallback(() => {
    if (requested.current) return
    requested.current = true
    setLoading(true)
    fetch('/api/public/lawyers')
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error('Failed to load the directory'))
      )
      .then((data: DirectoryListing[]) => setFirms(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load the directory')
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mode === 'full') {
      load()
      return
    }
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      load()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, load])

  const ready = firms !== null

  const countyOptions = useMemo(() => {
    if (!ready) return initialCounties
    const set = new Set<string>()
    firms!.forEach((f) => f.county && set.add(f.county))
    return Array.from(set).sort()
  }, [ready, firms, initialCounties])

  // Scoped by county but never by the search box, so typing does not
  // collapse the category grid out from under the visitor.
  const scoped = useMemo(
    () => (county ? (firms ?? []).filter((f) => f.county === county) : (firms ?? [])),
    [firms, county]
  )

  const areaCounts = useMemo(() => {
    if (!ready) return new Map(initialCounts)
    const counts = new Map<string, number>()
    scoped.forEach((f) =>
      f.practiceAreas.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    )
    return counts
  }, [ready, initialCounts, scoped])

  const visibleAreas = useMemo(
    () => catalog.filter((a) => (areaCounts.get(a) ?? 0) > 0 || a === area),
    [catalog, areaCounts, area]
  )

  /**
   * `requireCoordinates: false` — there is no map on this surface, so a
   * firm whose address never geocoded should still be findable by name
   * rather than vanish from search entirely. The admin tables make the
   * same choice for the same reason.
   */
  const index = useMemo(
    () =>
      buildSearchIndex(
        toSearchDocs([], indexable(firms ?? []), { requireCoordinates: false })
      ),
    [firms]
  )

  const outcome = useMemo(() => {
    const filters: SearchFilters = {}
    if (area) filters.tags = [area]
    if (county) filters.counties = [county]
    return search(index, query, { filters, sort: sortMode })
  }, [index, query, area, county, sortMode])

  const matched = useMemo(() => outcome.hits.map((hit) => hit.doc.source), [outcome])

  // Before the corpus arrives the server-rendered rows stand in, so the
  // list is never empty and never a bare spinner on first paint.
  const rows: DirectoryListing[] = ready ? matched : initialFirms
  const shown = mode === 'preview' ? rows.slice(0, PREVIEW_LIMIT) : rows.slice(0, limit)

  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index,
    facets: outcome.facets,
    query,
    entityHeading: 'Firms',
    categoryHeading: 'Practice areas',
    places: false,
  })

  const handleSelect = useCallback(
    (sug: Suggestion) => {
      if (sug.payload.kind === 'category') setArea(sug.payload.tag)
      else if (sug.payload.kind === 'recent') setQuery(sug.payload.query)
      else setQuery(sug.label)
      remember(sug.label)
    },
    [remember]
  )

  const hasActiveFilters = Boolean(area || county || query)
  const clearFilters = () => {
    setArea('')
    setCounty('')
    setQuery('')
  }

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold text-navy">
              Find a Florida attorney
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Search {total.toLocaleString('en-US')} firms by name, city, county or
              practice area — then call them directly.
            </p>
          </div>
          <SmartSearchBox
            className="w-full lg:w-80"
            value={query}
            onChange={(v) => {
              load()
              setQuery(v)
            }}
            onSubmit={(v) => {
              setQuery(v)
              remember(v)
            }}
            onSelect={handleSelect}
            onRemove={(sug) => forget(sug.label)}
            onOpenChange={(open) => {
              if (open) load()
            }}
            groups={suggestionGroups}
            resultCount={ready ? matched.length : undefined}
            aria-label="Search Florida attorneys by firm, city or county"
            placeholder="Search by firm, city, county..."
            data-testid="public-directory-search"
          />
        </div>
      </div>

      {/* Practice-area cards — the "types of lawyer" view */}
      <PracticeAreaCards
        areas={visibleAreas}
        counts={areaCounts}
        selected={area}
        onSelect={(next) => {
          load()
          setArea(next)
        }}
      />

      {/* Secondary filters + result count */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white shadow-sm border border-gray-200/80 px-5 py-3.5">
        {mode === 'full' && (
          <select
            value={county}
            onChange={(e) => {
              load()
              setCounty(e.target.value)
            }}
            onMouseDown={load}
            aria-label="Filter by county"
            className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10"
          >
            <option value="">All counties ({countyOptions.length})</option>
            {countyOptions.map((c) => (
              <option key={c} value={c}>
                {countyLabel(c)}
              </option>
            ))}
          </select>
        )}

        <span className="text-sm text-gray-500">
          <strong className="text-gray-900" data-testid="public-directory-count">
            {ready ? matched.length : total}
          </strong>{' '}
          of {total.toLocaleString('en-US')} firms
          {area && <span className="text-gray-400"> · {area}</span>}
        </span>

        <Segmented
          className="ml-auto"
          variant="track"
          options={PUBLIC_SORT}
          value={sortMode === 'relevance' ? 'relevance' : 'name'}
          onChange={(v) => {
            load()
            setSortMode(v)
          }}
          label="Order firms by"
          data-testid="public-directory-sort"
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <FilterX className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {error && shown.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : shown.length === 0 ? (
          loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
            </div>
          ) : (
            <EmptyState
              icon={Scale}
              title="No firms match these filters"
              hint={
                outcome.didYouMean || hasActiveFilters
                  ? undefined
                  : 'Try a different firm, city or county.'
              }
              data-testid="public-directory-empty"
              action={
                outcome.didYouMean ? (
                  <button
                    type="button"
                    onClick={() => setQuery(outcome.didYouMean!)}
                    data-testid="public-directory-did-you-mean"
                    className="rounded-lg bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Did you mean <span className="italic">{outcome.didYouMean}</span>?
                  </button>
                ) : hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    data-testid="public-directory-empty-clear"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map((firm) => (
              <FirmRow key={firm.id} firm={firm} />
            ))}
          </ul>
        )}
      </div>

      {mode === 'preview' ? (
        <div className="flex justify-center">
          <Link
            href={viewAllHref}
            data-testid="public-directory-view-all"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-6 py-3 text-sm font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 hover:-translate-y-px transition-all duration-200"
          >
            View all {total.toLocaleString('en-US')} firms
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        rows.length > shown.length && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_STEP)}
              data-testid="public-directory-show-more"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-navy shadow-sm hover:bg-gray-50 transition-colors"
            >
              Show {Math.min(PAGE_STEP, rows.length - shown.length)} more
            </button>
          </div>
        )
      )}
    </div>
  )
}
