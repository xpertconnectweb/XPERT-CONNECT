'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Car, FilterX } from 'lucide-react'
import { buildSearchIndex, searchWithFallback, toSearchDocs } from '@/lib/search'
import type { SearchFilters, SortMode } from '@/lib/search'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { EmptyState, Segmented } from '@/components/ui'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { countyLabel } from '@/lib/counties'
import {
  BODY_SHOP_STATES,
  STATE_NAMES,
  countyKey,
  isBodyShopState,
  parseCountyKey,
} from '@/lib/body-shop-meta'
import {
  toDirectoryUrlQuery,
  type DirectoryUrlState,
} from '@/lib/search/directory-url-state'
import type { BodyShopListing, BodyShopState } from '@/types/body-shops'
import { PracticeAreaCards } from './PracticeAreaCards'
import { FirmRow, type FirmRowData } from './FirmRow'
import { InfoRequestModal } from './InfoRequestModal'
import { shopKindMeta } from './shop-meta'

/**
 * The public Body Shops Directory: the landing block and /body-shops.
 *
 * Built on the same pieces as the lawyers directory (`PublicDirectory`):
 * the same search engine and search box, the same cards, rows and
 * "Get information" form, and the same loading rules. It is a separate
 * component rather than a mode of that one because the two differ where
 * it matters to a visitor:
 *
 *   - Two states. Florida and Minnesota share county names, so a state
 *     control sits next to the cards and a county is always a county of
 *     a state.
 *   - No location ranking. The lawyers directory reorders around a city
 *     it recognises from a Florida gazetteer, using each firm's
 *     coordinates. Most shops have none and half are in Minnesota, so
 *     here a city is matched as text, like a name.
 *   - No featured listing.
 */

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Best', 'aria-label': 'Best match' },
  { value: 'name', label: 'A–Z', 'aria-label': 'Alphabetical' },
] as const

const PREVIEW_LIMIT = 9
const PAGE_STEP = 60
const FALLBACK_LIMIT = 12
const NOUN = { one: 'shop', many: 'shops' }

type StateChoice = '' | BodyShopState

/**
 * Shops in the lawyer adapter's shape, which is what the search engine
 * indexes. The kind (independent, or the chain) is the tag, as a practice
 * area is for a firm. There are no coordinates; with
 * `requireCoordinates: false` that only means no distance ranking.
 */
function indexable(shops: readonly BodyShopListing[]) {
  return shops.map((s) => ({
    ...s,
    practiceAreas: [s.kind],
    lat: 0,
    lng: 0,
    available: true,
  }))
}

/** What a row shows: the city with its state, since there are two. */
function toRow(shop: BodyShopListing): FirmRowData {
  return {
    id: shop.id,
    name: shop.name,
    city: `${shop.city}, ${shop.state}`,
    county: shop.county,
    practiceAreas: [shop.kind],
  }
}

export interface BodyShopDirectoryProps {
  /** Rendered by the server, so the list is populated before any fetch. */
  initialShops: BodyShopListing[]
  /** [kind, count] over the whole corpus, independents first. */
  initialKinds: [string, number][]
  initialStates: [BodyShopState, number][]
  /** `countyKey`s over the whole corpus. */
  initialCounties: string[]
  total: number
  /** `preview` is the landing block, `full` is /body-shops. */
  mode?: 'preview' | 'full'
  viewAllHref?: string
  /** Parsed from the query string by `BodyShopDirectoryClient`. */
  initialState?: DirectoryUrlState
}

export function BodyShopDirectory({
  initialShops,
  initialKinds,
  initialStates,
  initialCounties,
  total,
  mode = 'full',
  viewAllHref = '/body-shops',
  initialState,
}: BodyShopDirectoryProps) {
  const [shops, setShops] = useState<BodyShopListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(initialState?.q ?? '')
  const [kind, setKind] = useState(initialState?.area ?? '')
  const [usState, setUsState] = useState<StateChoice>(
    isBodyShopState(initialState?.state) ? initialState!.state as BodyShopState : ''
  )
  // A county only stands with its state; one from the URL without a
  // state is dropped rather than guessed.
  const [county, setCounty] = useState(
    initialState?.county && isBodyShopState(initialState?.state) ? initialState.county : ''
  )
  const [sortMode, setSortMode] = useState<SortMode>(initialState?.sort ?? 'relevance')
  const [limit, setLimit] = useState(initialState?.show ?? PAGE_STEP)
  const [infoShop, setInfoShop] = useState<FirmRowData | null>(null)
  const closeInfo = useCallback(() => setInfoShop(null), [])

  const requested = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  // ── URL state, on /body-shops only (see PublicDirectory for why) ──
  const urlState: DirectoryUrlState = useMemo(
    () => ({
      q: query || undefined,
      area: kind || undefined,
      state: usState || undefined,
      county: county || undefined,
      sort: sortMode === 'name' ? 'name' : undefined,
      show: limit,
    }),
    [query, kind, usState, county, sortMode, limit]
  )

  useEffect(() => {
    if (mode !== 'full') return
    const handle = setTimeout(() => {
      const next = toDirectoryUrlQuery(urlState)
      if (typeof window !== 'undefined' && window.location.search === next) return
      router.replace(`${pathname}${next}`, { scroll: false })
    }, 300)
    return () => clearTimeout(handle)
  }, [mode, pathname, router, urlState])

  // ── The corpus: fetched once, after paint or on first sign of interest ──
  const load = useCallback(() => {
    if (requested.current) return
    requested.current = true
    setLoading(true)
    fetch('/api/public/body-shops')
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error('Failed to load the directory'))
      )
      .then((data: BodyShopListing[]) => setShops(data))
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

  const ready = shops !== null

  // ── Facets ──
  const stateCounts = useMemo(() => {
    if (!ready) return new Map(initialStates)
    const counts = new Map<BodyShopState, number>()
    shops!.forEach((s) => counts.set(s.state, (counts.get(s.state) ?? 0) + 1))
    return counts
  }, [ready, shops, initialStates])

  const countyOptions = useMemo(() => {
    const keys = ready
      ? Array.from(new Set(shops!.map((s) => countyKey(s.state, s.county)))).sort()
      : initialCounties
    return keys
      .map(parseCountyKey)
      .filter((c): c is { state: BodyShopState; county: string } => c !== null)
      .filter((c) => !usState || c.state === usState)
  }, [ready, shops, initialCounties, usState])

  // Scoped by state and county but never by the search box, so typing
  // does not collapse the cards out from under the visitor.
  const scoped = useMemo(
    () =>
      (shops ?? []).filter(
        (s) => (!usState || s.state === usState) && (!county || s.county === county)
      ),
    [shops, usState, county]
  )

  const kindCounts = useMemo(() => {
    if (!ready) return new Map(initialKinds)
    const counts = new Map<string, number>()
    scoped.forEach((s) => counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1))
    return counts
  }, [ready, initialKinds, scoped])

  const catalog = useMemo(() => initialKinds.map(([k]) => k), [initialKinds])
  const visibleKinds = useMemo(
    () => catalog.filter((k) => (kindCounts.get(k) ?? 0) > 0 || k === kind),
    [catalog, kindCounts, kind]
  )

  // ── Search ──
  const index = useMemo(
    () =>
      buildSearchIndex(
        toSearchDocs([], indexable(shops ?? []), {
          requireCoordinates: false,
          // "attorney", "law firm"… are the lawyer adapter's vocabulary.
          includeKindWords: false,
        })
      ),
    [shops]
  )

  const result = useMemo(() => {
    const filters: SearchFilters = {}
    if (kind) filters.tags = [kind]
    if (usState) filters.states = [usState]
    if (county) filters.counties = [county]
    return searchWithFallback(
      index,
      query,
      { filters, sort: sortMode },
      { limit: FALLBACK_LIMIT }
    )
  }, [index, query, kind, usState, county, sortMode])

  const outcome = result.primary
  const fallback = result.fallback
  const matched = useMemo(
    () => outcome.hits.map((hit) => hit.doc.source as unknown as BodyShopListing),
    [outcome]
  )
  const fallbackRows = useMemo(
    () =>
      fallback?.outcome.hits
        .slice(0, FALLBACK_LIMIT)
        .map((hit) => hit.doc.source as unknown as BodyShopListing) ?? [],
    [fallback]
  )

  const hasActiveFilters = Boolean(kind || usState || county || query)
  const hasOtherFilters = Boolean(kind || usState || county)

  /**
   * See PublicDirectory: the sample is shown only while nobody has asked
   * for anything. On the landing block it also outlives the fetch. With
   * no search, "all 1,311 shops" in ZIP order would replace a sample
   * chosen to show both states and both kinds of shop with nine shops
   * from the Florida–Georgia line.
   */
  const view: 'showcase' | 'loading' | 'results' =
    !hasActiveFilters && (mode === 'preview' || !ready)
      ? 'showcase'
      : ready
        ? 'results'
        : 'loading'

  const rows: BodyShopListing[] = view === 'results' ? matched : initialShops
  const shown =
    view === 'loading'
      ? []
      : mode === 'preview'
        ? rows.slice(0, PREVIEW_LIMIT)
        : rows.slice(0, limit)

  const entitySublabel = useCallback((source: unknown) => {
    const shop = source as BodyShopListing
    return shop?.city ? `${shop.city}, ${shop.state}` : undefined
  }, [])

  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index,
    facets: outcome.facets,
    query,
    entityHeading: 'Body shops',
    entitySublabel,
    categoryHeading: 'Shop types',
    places: false,
    indexStatus: ready ? 'ok' : 'loading',
  })

  const handleSelect = useCallback(
    (sug: Suggestion) => {
      if (sug.payload.kind === 'category') setKind(sug.payload.tag)
      else if (sug.payload.kind === 'recent') setQuery(sug.payload.query)
      else setQuery(sug.label)
      remember(sug.label)
    },
    [remember]
  )

  const chooseState = (next: StateChoice) => {
    load()
    setUsState(next)
    // A county of the other state would filter everything out.
    if (next && county && !countyOptions.some((c) => c.state === next && c.county === county)) {
      setCounty('')
    }
    if (!next) setCounty('')
  }

  const clearFilters = () => {
    setKind('')
    setUsState('')
    setCounty('')
    setQuery('')
  }

  const totalLabel = total.toLocaleString('en-US')
  const placeLabel = county
    ? `${countyLabel(county)}, ${usState}`
    : usState
      ? STATE_NAMES[usState]
      : ''

  const emptyTitle = placeLabel && !query && !kind
    ? `No body shops in ${placeLabel}`
    : 'No body shops match these filters'

  const viewAllLabel = (() => {
    const text = query.trim()
    if (!text) return `View all ${totalLabel} body shops`
    if (view === 'results') {
      return `View all ${matched.length.toLocaleString('en-US')} ${matched.length === 1 ? 'match' : 'matches'} for “${text}”`
    }
    return `Search all ${totalLabel} body shops for “${text}”`
  })()

  const hasFallback = view === 'results' && Boolean(fallback) && fallbackRows.length > 0
  const fallbackNote = (() => {
    if (!fallback) return null
    if (fallback.kind === 'filters-relaxed') {
      const what = kind || placeLabel || 'these filters'
      return `Nothing in ${what}. Showing every shop matching “${query.trim()}”.`
    }
    if (fallback.kind === 'partial') return 'No exact match. Showing the closest.'
    return null
  })()

  const stateOptions = useMemo(
    () => [
      { value: '' as StateChoice, label: 'All', 'aria-label': 'All states' },
      ...BODY_SHOP_STATES.filter((st) => stateCounts.has(st)).map((st) => ({
        value: st as StateChoice,
        label: STATE_NAMES[st],
        'aria-label': `${STATE_NAMES[st]}, ${stateCounts.get(st) ?? 0} shops`,
      })),
    ],
    [stateCounts]
  )

  const renderRow = (shop: BodyShopListing) => (
    <FirmRow
      key={shop.id}
      firm={toRow(shop)}
      icon={Car}
      testId="body-shop-row"
      onRequestInfo={setInfoShop}
    />
  )

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Search */}
      <div
        className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6"
        onPointerEnter={load}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold text-navy">Find a body shop</h3>
            <p className="text-sm text-gray-500 mt-1">
              Search {totalLabel} verified collision and paint shops by name, city, county
              or chain — then request their contact information.
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
            aria-label="Search body shops by name, city, county or chain"
            placeholder="Search by shop, city, county..."
            data-testid="body-shop-search"
          />
        </div>
      </div>

      {/* State, then the kinds of shop */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">State</span>
        <Segmented
          variant="chips"
          options={stateOptions}
          value={usState}
          onChange={chooseState}
          label="Filter by state"
          data-testid="body-shop-state"
        />
      </div>

      <PracticeAreaCards
        areas={visibleKinds}
        counts={kindCounts}
        selected={kind}
        noun={NOUN}
        meta={shopKindMeta}
        onSelect={(next) => {
          load()
          setKind(next)
        }}
      />

      {/* Secondary filters + result count */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white shadow-sm border border-gray-200/80 px-5 py-3.5">
        {mode === 'full' && (
          <select
            value={county ? countyKey(usState || 'FL', county) : ''}
            onChange={(e) => {
              load()
              const picked = parseCountyKey(e.target.value)
              if (!picked) {
                setCounty('')
                return
              }
              setUsState(picked.state)
              setCounty(picked.county)
            }}
            onMouseDown={load}
            aria-label="Filter by county"
            data-testid="body-shop-county"
            className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10"
          >
            <option value="">
              All counties{usState ? ` in ${STATE_NAMES[usState]}` : ''} ({countyOptions.length})
            </option>
            {countyOptions.map((c) => (
              <option key={countyKey(c.state, c.county)} value={countyKey(c.state, c.county)}>
                {countyLabel(c.county)}
                {usState ? '' : `, ${c.state}`}
              </option>
            ))}
          </select>
        )}

        <span className="text-sm text-gray-500" aria-busy={view === 'loading'}>
          <strong className="text-gray-900" data-testid="body-shop-count" data-state={view}>
            {view === 'results'
              ? matched.length.toLocaleString('en-US')
              : view === 'showcase'
                ? initialShops.length
                : '—'}
          </strong>{' '}
          of {totalLabel} shops
          {kind && <span className="text-gray-400"> · {kind}</span>}
          {placeLabel && <span className="text-gray-400"> · {placeLabel}</span>}
        </span>

        <Segmented
          className="ml-auto"
          variant="track"
          options={SORT_OPTIONS}
          value={sortMode === 'relevance' ? 'relevance' : 'name'}
          onChange={(v) => {
            load()
            setSortMode(v)
          }}
          label="Order shops by"
          data-testid="body-shop-sort"
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
        {view === 'showcase' && (
          <p
            className="border-b border-gray-100 bg-gray-50/60 px-5 py-2.5 text-xs text-gray-500"
            data-testid="body-shop-sample-note"
          >
            A sample of {totalLabel} verified shops — search to see them all.
          </p>
        )}

        {error && shown.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : view === 'loading' ? (
          <div data-testid="body-shop-skeleton" aria-busy="true">
            <p className="sr-only">Searching {totalLabel} shops…</p>
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
            <div className="px-5 py-4" data-testid="body-shop-empty">
              <p className="text-sm font-semibold text-gray-900">{emptyTitle}</p>
            </div>
          ) : (
            <EmptyState
              icon={Car}
              title={emptyTitle}
              hint={
                outcome.didYouMean || hasActiveFilters
                  ? undefined
                  : 'Try a different shop, city or county.'
              }
              data-testid="body-shop-empty"
              action={
                outcome.didYouMean ? (
                  <button
                    type="button"
                    onClick={() => setQuery(outcome.didYouMean!)}
                    className="rounded-lg bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Did you mean <span className="italic">{outcome.didYouMean}</span>?
                  </button>
                ) : hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul className="divide-y divide-gray-100">{shown.map(renderRow)}</ul>
        )}

        {hasFallback && fallbackNote && (
          <div data-testid="body-shop-fallback">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-gray-100 bg-gray-50/60 px-5 py-2.5">
              <p className="text-xs text-gray-600">{fallbackNote}</p>
              {hasOtherFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-navy underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-100">{fallbackRows.map(renderRow)}</ul>
          </div>
        )}
      </div>

      {mode === 'preview' ? (
        <div className="flex flex-col items-center gap-2">
          {view === 'results' && matched.length > shown.length && (
            <p className="text-xs text-gray-500">
              Showing {shown.length} of {matched.length.toLocaleString('en-US')} matches
            </p>
          )}
          <Link
            href={`${viewAllHref}${toDirectoryUrlQuery({
              q: query || undefined,
              area: kind || undefined,
              state: usState || undefined,
              sort: sortMode === 'name' ? 'name' : undefined,
            })}`}
            data-testid="body-shop-view-all"
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
              data-testid="body-shop-show-more"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-navy shadow-sm hover:bg-gray-50 transition-colors"
            >
              Show {Math.min(PAGE_STEP, rows.length - shown.length)} more
            </button>
          </div>
        )
      )}

      {infoShop && (
        <InfoRequestModal
          firm={infoShop}
          onClose={closeInfo}
          inquiryUrl={`/api/public/body-shops/${encodeURIComponent(infoShop.id)}/inquiry`}
          noun="shop"
        />
      )}
    </div>
  )
}
