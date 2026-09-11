'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, FilterX, Scale } from 'lucide-react'
import { buildSearchIndex, interpretQuery, searchWithFallback, toSearchDocs } from '@/lib/search'
import type { SearchFilters, SortMode } from '@/lib/search'
import { matchFloridaPlaces, nearestCities } from '@/lib/places/florida'
import { resolveLocationIntent } from '@/lib/places/intent'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { EmptyState, Segmented } from '@/components/ui'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { countyLabel } from '@/lib/counties'
import { hoistFeatured, isFeaturedFirm } from '@/lib/directory-featured'
import {
  toDirectoryUrlQuery,
  type DirectoryUrlState,
} from '@/lib/search/directory-url-state'
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
 * How many consolation rows to show when the search itself found nothing.
 *
 * Small on purpose. These are an offer, not a result set — 103 personal
 * injury firms sorted by distance from a city with none is a worse
 * answer than a dozen, and pretending otherwise is how a fallback stops
 * reading as a fallback.
 */
const FALLBACK_LIMIT = 12

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
  /**
   * State parsed from the query string, so a shared link opens on the
   * search it describes. Supplied by `DirectoryClient`; the landing
   * block leaves it unset.
   */
  initialState?: DirectoryUrlState
}

export function PublicDirectory({
  initialFirms,
  initialCounts,
  initialCounties,
  total,
  catalog,
  mode = 'full',
  viewAllHref = '/directory',
  initialState,
}: PublicDirectoryProps) {
  const [firms, setFirms] = useState<DirectoryListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Seeded from the URL, so a shared link opens on the search it names.
  const [query, setQuery] = useState(initialState?.q ?? '')
  const [area, setArea] = useState(initialState?.area ?? '')
  const [county, setCounty] = useState(initialState?.county ?? '')
  const [sortMode, setSortMode] = useState<SortMode>(initialState?.sort ?? 'relevance')
  const [limit, setLimit] = useState(initialState?.show ?? PAGE_STEP)

  const requested = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const router = useRouter()
  const pathname = usePathname()

  /**
   * Mirror the state into the URL, so a search can be shared and Back
   * goes back to it.
   *
   * `replace`, and debounced: `push` on every keystroke would make the
   * back button walk out of a search one character at a time. Only the
   * full page does this — the landing block is a section of the
   * marketing page and has no business rewriting its URL.
   */
  const urlState: DirectoryUrlState = useMemo(
    () => ({
      q: query || undefined,
      area: area || undefined,
      county: county || undefined,
      sort: sortMode === 'name' ? 'name' : undefined,
      show: limit,
    }),
    [query, area, county, sortMode, limit]
  )

  useEffect(() => {
    if (mode !== 'full') return
    const handle = setTimeout(() => {
      const next = toDirectoryUrlQuery(urlState)
      /**
       * Write only a URL that differs from the one in the bar.
       *
       * Without this the effect fires once on mount with nothing to
       * say, and a `replace` to the URL you are already on is still a
       * navigation. Three hundred milliseconds is long enough to click
       * a header link in, and the replace then landed after that
       * navigation and pulled the visitor back to /directory. The
       * "About Us" link from this page stopped working.
       */
      if (typeof window !== 'undefined' && window.location.search === next) return
      router.replace(`${pathname}${next}`, { scroll: false })
    }, 300)
    return () => clearTimeout(handle)
  }, [mode, pathname, router, urlState])

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

    /**
     * Deferring the fetch protects first paint. It does NOT have to
     * mean the corpus arrives late.
     *
     * Waiting for a scroll or a click was the whole strategy, and it
     * loses whenever someone goes straight for the search box: they
     * type "Bradenton", and for as long as the 211 KB is in flight the
     * index is empty, so the page has nothing to match against. An idle
     * callback runs after paint — LCP is untouched — and in practice
     * the corpus is in hand before anyone has finished reading the
     * heading above it.
     *
     * The observer stays: idle time never comes on a busy page, and
     * that is exactly the page where scrolling to this section is the
     * clearest statement of intent. `load` is ref-guarded, so all of
     * these racing each other is fine.
     */
    const idle =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? window.requestIdleCallback(() => load(), { timeout: 2500 })
        : (setTimeout(load, 2500) as unknown as number)

    const cancelIdle = () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idle)
      } else {
        clearTimeout(idle)
      }
    }

    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      load()
      return cancelIdle
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
    return () => {
      observer.disconnect()
      cancelIdle()
    }
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

  /**
   * Where the query points, if anywhere.
   *
   * Resolved from the offline gazetteer rather than a geocoder — the
   * geocoding endpoint requires a session and must keep requiring one.
   * Because `ALPHA` is 0.6 and `TAU_MILES` 12, an anchor only reorders:
   * it can never filter anything out. That is what makes it safe to
   * apply from a guess about what a word meant, and it is what puts
   * Manatee-area firms at the top of "personal injury Bradenton"
   * instead of whichever firm in Miami scored highest.
   */
  const { intent, meaningfulTokens } = useMemo(() => {
    if (!query.trim()) return { intent: null, meaningfulTokens: 0 }
    const interpreted = interpretQuery(query)
    const qualifiers = new Set(['county', 'parish', 'borough', 'fl', 'florida'])
    return {
      intent: resolveLocationIntent(interpreted),
      meaningfulTokens: interpreted.tokens.filter((t) => !qualifiers.has(t.raw)).length,
    }
  }, [query])

  const result = useMemo(() => {
    const filters: SearchFilters = {}
    if (area) filters.tags = [area]
    if (county) filters.counties = [county]
    const anchor = intent ? ([intent.place.lat, intent.place.lng] as const) : null

    return searchWithFallback(
      index,
      query,
      { filters, sort: sortMode, anchor },
      {
        anchor,
        placeLabel: intent?.label ?? null,
        // Only computed when the ladder can actually use it — this is a
        // linear pass over the corpus.
        nearest: anchor ? nearestCities(index.docs, anchor, 3) : [],
        // The query was nothing but the place name, so partial word
        // matching on it would be noise rather than a near miss.
        placeOnly: intent ? intent.matched.length === meaningfulTokens : false,
        limit: FALLBACK_LIMIT,
      }
    )
  }, [index, query, area, county, sortMode, intent, meaningfulTokens])

  const outcome = result.primary
  const fallback = result.fallback

  const rawMatched = useMemo(() => outcome.hits.map((hit) => hit.doc.source), [outcome])

  /**
   * The featured firm leads every list, whatever was searched.
   *
   * Two cases, and they are different. When it is among the matches it
   * is simply hoisted. When it is NOT — a search for "Miami", a county
   * filter it falls outside of — it is injected anyway, because the
   * brief was "first, no matter what". That is an editorial decision
   * rather than a relevance one, so the row carries a "Featured" label
   * and is NOT counted: `matched.length` keeps reporting what actually
   * matched, or the count would start disagreeing with the filters
   * right next to it.
   */
  const featuredFirm = useMemo(
    () => (firms ?? []).find((f) => isFeaturedFirm(f.id)) ?? null,
    [firms]
  )

  const featuredInMatches = useMemo(
    () => (featuredFirm ? rawMatched.some((f) => f.id === featuredFirm.id) : false),
    [featuredFirm, rawMatched]
  )

  const matched = useMemo(() => hoistFeatured(rawMatched), [rawMatched])
  const fallbackRows = useMemo(
    () => fallback?.outcome.hits.slice(0, FALLBACK_LIMIT).map((hit) => hit.doc.source) ?? [],
    [fallback]
  )

  /** Firms per city, so a suggestion can be honest before it is clicked. */
  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>()
    ;(firms ?? []).forEach((f) => {
      if (f.city) counts.set(f.city, (counts.get(f.city) ?? 0) + 1)
    })
    return counts
  }, [firms])

  const hasActiveFilters = Boolean(area || county || query)
  /** Filters other than the text, which is what `intent` already explains. */
  const hasOtherFilters = Boolean(area || county)

  /**
   * Three states, named, because conflating two of them is what made
   * this look broken.
   *
   * `rows = ready ? matched : initialFirms` reads as a graceful
   * fallback and is actually a lie: before the corpus lands it renders
   * the nine server-picked showcase firms *as though they were the
   * results for whatever was typed*. Search "Bradenton" during that
   * window and you get nine firms from Orlando and Miami under a
   * counter reading "627 of 627". Nothing on screen suggests the
   * search has not run yet, so the only available conclusion is that
   * the directory does not have Bradenton in it.
   *
   * So: the sample is shown only when nobody has asked for anything.
   * The moment there is a query or a filter, an unanswered question
   * renders as an unanswered question.
   */
  const view: 'showcase' | 'loading' | 'results' = ready
    ? 'results'
    : hasActiveFilters
      ? 'loading'
      : 'showcase'

  const rows: DirectoryListing[] = view === 'results' ? matched : initialFirms
  const shown =
    view === 'loading'
      ? []
      : mode === 'preview'
        ? rows.slice(0, PREVIEW_LIMIT)
        : rows.slice(0, limit)

  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index,
    facets: outcome.facets,
    query,
    entityHeading: 'Firms',
    categoryHeading: 'Practice areas',
    places: false,
    // An empty index is not an empty result set. Without this the
    // dropdown silently drops both groups while the corpus is in
    // flight, which looks identical to "no such city".
    indexStatus: ready ? 'ok' : 'loading',
    // Offline places, so a public visitor gets city suggestions without
    // us opening a geocoding endpoint to the internet.
    placeMatcher: matchFloridaPlaces,
    placeCounts: ready ? cityCounts : undefined,
  })

  const handleSelect = useCallback(
    (sug: Suggestion) => {
      if (sug.payload.kind === 'category') setArea(sug.payload.tag)
      else if (sug.payload.kind === 'recent') setQuery(sug.payload.query)
      else if (sug.payload.kind === 'locality') {
        /**
         * A county is a filter, a city is a search.
         *
         * Putting a county in the text box would make it compete with
         * the `<select>` two inches away that is already showing
         * "Manatee County" — two controls, same intent, disagreeing.
         * Setting the filter makes the dropdown and the select agree.
         */
        if (sug.payload.isCounty) setCounty(sug.payload.county)
        else setQuery(sug.payload.name)
      } else setQuery(sug.label)
      remember(sug.label)
    },
    [remember]
  )

  /**
   * Name the gap instead of blaming the filters.
   *
   * "No firms match these filters" was the answer to every empty
   * search, including the ones where there were no filters — so
   * somebody searching a city we do not cover was told to adjust
   * controls they had never touched.
   */
  const emptyTitle =
    intent && !hasOtherFilters
      ? `No firms in ${intent.label}`
      : 'No firms match these filters'

  /**
   * The button has to mean what it says at each of the three moments.
   *
   * "View all 627 firms" under a search for Bradenton is not wrong so
   * much as unhelpful — it answers a question nobody asked. And while
   * the corpus is still loading there is no match count to promise, so
   * it offers the search instead of a number it does not have.
   */
  const viewAllLabel = (() => {
    const text = query.trim()
    if (!text) return `View all ${total.toLocaleString('en-US')} firms`
    if (view === 'results') {
      return `View all ${matched.length} ${matched.length === 1 ? 'match' : 'matches'} for “${text}”`
    }
    return `Search all ${total.toLocaleString('en-US')} firms for “${text}”`
  })()

  const hasFallback = view === 'results' && Boolean(fallback) && fallbackRows.length > 0

  /** The ladder's banner, in the words of whichever rung answered. */
  const fallbackNote = (() => {
    if (!fallback) return null
    if (fallback.kind === 'filters-relaxed') {
      const what = area || (county ? countyLabel(county) : 'these filters')
      return `Nothing in ${what}. Showing every firm matching “${query.trim()}”.`
    }
    if (fallback.kind === 'partial') {
      return `No exact match. Showing the closest${intent ? ` to ${intent.label}` : ''}.`
    }
    const near = fallback.near
    if (!near) return null
    // The heading directly above already says "No firms in X"; repeating
    // it here just makes the page say the same sentence twice.
    return `The nearest are in ${near.city}, ${near.miles.toFixed(0)} mi away — ${near.count} ${
      near.count === 1 ? 'firm' : 'firms'
    }.`
  })()

  const clearFilters = () => {
    setArea('')
    setCounty('')
    setQuery('')
  }

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Search */}
      <div
        className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6"
        // Reaching for the box is intent. Focus already triggers the
        // fetch via onOpenChange; this buys the round trip a head start
        // of however long it takes to travel the last few pixels.
        onPointerEnter={load}
      >
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

        {/* The count must never describe a list the visitor is not
            looking at. It used to read "627 of 627" above nine
            unrelated rows while a search was still loading. */}
        <span className="text-sm text-gray-500" aria-busy={view === 'loading'}>
          <strong
            className="text-gray-900"
            data-testid="public-directory-count"
            data-state={view}
          >
            {view === 'results' ? matched.length : view === 'showcase' ? initialFirms.length : '—'}
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
        {/**
         * The featured firm, when the current search does not contain it.
         *
         * Rendered above the list rather than spliced into it, and kept
         * out of `matched`, so the count beside the filters still
         * describes the filters. Pinned "no matter what" was the brief;
         * quietly inflating the result count was not part of it.
         */}
        {view === 'results' && featuredFirm && !featuredInMatches && (
          <ul className="divide-y divide-gray-100 border-b border-gray-100">
            <FirmRow firm={featuredFirm} featured />
          </ul>
        )}

        {view === 'showcase' && (
          // Says what the nine rows are. They are a deliberate sample —
          // one per practice area, then one per city — not the top of a
          // ranking, and certainly not an answer to a search.
          <p
            className="border-b border-gray-100 bg-gray-50/60 px-5 py-2.5 text-xs text-gray-500"
            data-testid="public-directory-sample-note"
          >
            A sample of {total.toLocaleString('en-US')} firms — search to see them all.
          </p>
        )}

        {error && shown.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : view === 'loading' ? (
          /**
           * Skeletons rather than the showcase, and rather than a bare
           * spinner. The rows that are coming are firm rows, so the
           * placeholder is shaped like one — the list does not jump when
           * the corpus lands, and nothing on screen claims to be an
           * answer before one exists.
           */
          <div data-testid="public-directory-skeleton" aria-busy="true">
            <p className="sr-only">Searching {total.toLocaleString('en-US')} firms…</p>
            <ul className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-gray-100" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div
                      className="h-3.5 animate-pulse rounded bg-gray-100"
                      style={{ width: `${58 - i * 6}%` }}
                    />
                    <div
                      className="h-3 animate-pulse rounded bg-gray-50"
                      style={{ width: `${38 - i * 4}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : shown.length === 0 ? (
          loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
            </div>
          ) : hasFallback ? (
            /**
             * A compact line, not the full empty state.
             *
             * The illustrated "No firms match these filters" block was
             * rendering directly above eleven firms, which reads as the
             * page contradicting itself. When there is something to
             * offer, the offer is the content and this is just its
             * heading.
             */
            <div className="px-5 py-4" data-testid="public-directory-empty">
              <p className="text-sm font-semibold text-gray-900">{emptyTitle}</p>
            </div>
          ) : (
            <EmptyState
              icon={Scale}
              title={emptyTitle}
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
              <FirmRow key={firm.id} firm={firm} featured={isFeaturedFirm(firm.id)} />
            ))}
          </ul>
        )}

        {/**
         * The consolation, under its own banner.
         *
         * Never appended to the results — that is the same mistake as
         * rendering the showcase during a search, one step further down
         * the page. These rows answer a question the visitor did not
         * ask, so the banner says which one.
         */}
        {hasFallback && (
          <div data-testid="public-directory-fallback">
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-gray-100 bg-gray-50/60 px-5 py-2.5"
              data-testid="public-directory-fallback-note"
              data-kind={fallback!.kind}
            >
              <p className="text-xs text-gray-600">{fallbackNote}</p>
              {hasOtherFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  data-testid="public-directory-empty-clear"
                  className="text-xs font-semibold text-navy underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-100">
              {fallbackRows.map((firm) => (
                <FirmRow key={firm.id} firm={firm} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {mode === 'preview' ? (
        <div className="flex flex-col items-center gap-2">
          {/* The nine rows are a slice of something bigger; say how much
              bigger, rather than letting the count above be the only clue. */}
          {view === 'results' && matched.length > shown.length && (
            <p className="text-xs text-gray-500" data-testid="public-directory-preview-note">
              Showing {shown.length} of {matched.length} matches
            </p>
          )}
          <Link
            /**
             * Carries the search across.
             *
             * This used to be a bare `/directory`, so the most natural
             * path through the whole feature — search here, click
             * through for the rest — dropped the query on the way and
             * landed on an unfiltered list of 627 firms.
             */
            href={`${viewAllHref}${toDirectoryUrlQuery({
              q: query || undefined,
              area: area || undefined,
              sort: sortMode === 'name' ? 'name' : undefined,
            })}`}
            data-testid="public-directory-view-all"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-6 py-3 text-sm font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 hover:-translate-y-px transition-all duration-200"
          >
            {viewAllLabel}
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
