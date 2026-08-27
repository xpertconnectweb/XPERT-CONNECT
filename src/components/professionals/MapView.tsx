'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { MapContainer, TileLayer, ZoomControl, Circle, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, RefreshCw, Search, X,
  Locate, Loader2, List as ListIcon, ChevronRight, Building2, Scale, Stethoscope,
  Copy, Check, SlidersHorizontal, MapPin,
} from 'lucide-react'
import { ReferralFormModal } from './ReferralFormModal'
import { ClinicReferralFormModal } from './ClinicReferralFormModal'
import { MedicalSpecialistReferralModal } from './MedicalSpecialistReferralModal'
import { MarkerClusterLayer, type MarkerRegistry } from './map/MarkerClusterLayer'
import { ProviderDetail } from './map/ProviderDetail'
import { VirtualPanelList, type ScrollRequest } from './map/VirtualPanelList'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import { LocationAnchor } from '@/components/search/LocationAnchor'
import type { Suggestion } from '@/components/search/types'
import { Chip, EmptyState, Segmented, Sheet, SNAP_FRACTION, type SheetSnap } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useMapSearch } from '@/hooks/useMapSearch'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { resolveOnce, type ProximityHint } from '@/hooks/useGeocoder'
import { useReverseGeocode } from '@/hooks/useReverseGeocode'
import { quantizeProximity } from '@/lib/geocoding/bias'
import { MIN_GEOCODE_QUERY } from '@/lib/geocoding/constants'
import { clinicAvailIcon, homeIcon } from '@/lib/map/icons'
import {
  US_DEFAULT_CENTER, US_DEFAULT_ZOOM, STATE_MAP_CONFIG, haversineDistance,
  toLatLngBounds, radiusBounds, prefersReducedMotion,
} from '@/lib/map/geo'
import { search } from '@/lib/search'
import type { Bounds, SortMode } from '@/lib/search'
import { parseMapUrlState, toMapUrlQuery } from '@/lib/search/url-state'
import {
  ZOOM_FOR_KIND,
  type GeocodeAddress,
  type GeocodePrecision,
  type GeocodeResult,
} from '@/types/geocode'
import { cn } from '@/lib/utils'
import type { MapItem } from '@/lib/map/types'
import type { Clinic } from '@/types/professionals'
import type { Lawyer } from '@/types/professionals'
import type { DecoratedClinic, DecoratedLawyer } from '@/types/professionals'

L.Marker.prototype.options.icon = clinicAvailIcon

/**
 * The FLOOR under how far the map has to move before "Search this area" is
 * offered. Opening a popup nudges the centre slightly, and a pill that appears
 * every time you click a pin is noise.
 *
 * A floor rather than the threshold itself — see `handleMapMoveEnd`, where the
 * real bar is a share of the visible width. Two miles is most of a city block
 * at street zoom and a rounding error at state zoom, so as an absolute it was
 * wrong at both ends; it just happened to be wrong in the quiet direction at
 * the zoom people spend most of their time at, which is why nobody noticed.
 */
const MOVED_THRESHOLD_MILES = 2

/**
 * How much ground the map shows when it opens on the user's own office.
 *
 * Twenty-five miles, because that is the radius a referral is realistically
 * made within and it is one of the options the radius control already offers.
 * Wide enough that a city reads as a city, tight enough that the pins are
 * places rather than a cloud.
 */
const HOME_RADIUS_MILES = 25

/**
 * `'any'` rather than `null` because a radiogroup needs a value for every
 * option, and "no limit" is a choice like any other.
 */
const RADIUS_OPTIONS = [
  { value: 'any', label: 'Any', 'aria-label': 'Any distance' },
  { value: '5', label: '5 mi', 'aria-label': 'Within 5 miles' },
  { value: '10', label: '10 mi', 'aria-label': 'Within 10 miles' },
  { value: '25', label: '25 mi', 'aria-label': 'Within 25 miles' },
  { value: '50', label: '50 mi', 'aria-label': 'Within 50 miles' },
] as const

/** Enough to browse, few enough to stay on one scrollable line. */
const MAX_VISIBLE_TAGS = 6

const SORT_OPTIONS = [
  { value: 'auto', label: 'Best', 'aria-label': 'Best match' },
  { value: 'distance', label: 'Nearest', 'aria-label': 'Nearest first' },
  { value: 'name', label: 'A–Z', 'aria-label': 'Alphabetical' },
  { value: 'availability', label: 'Open', 'aria-label': 'Accepting referrals first' },
] as const

/** The heading is derived from the ordering so the two cannot disagree. */
const SORT_HEADINGS: Record<SortMode, string> = {
  relevance: 'Best Matches',
  distance: 'Nearest Results',
  name: 'All Results, A–Z',
  availability: 'Accepting Referrals First',
}

/**
 * Binds map events through react-leaflet's own hook.
 *
 * The listener used to be attached in `whenReady` via `mapRef.current?.on(...)`,
 * which is not safe: `whenReady` can fire before the ref is assigned, and the
 * optional chaining then swallows the failure silently, leaving `moveend`
 * unbound with no error anywhere. `useMapEvents` cannot get this wrong.
 */
function MapEvents({
  onMoveEnd,
  onPick,
}: {
  onMoveEnd: (map: L.Map) => void
  /** Only bound while the user has asked to place the pin by hand. */
  onPick?: (lat: number, lng: number) => void
}) {
  const map = useMapEvents({
    moveend: () => onMoveEnd(map),
    click: (event) => onPick?.(event.latlng.lat, event.latlng.lng),
  })
  return null
}

/* ═══════════════════════════════════════════════════════════ */
interface MapViewProps {
  clinicsUrl?: string
  lawyersUrl?: string
  showLawyers?: boolean
  showClinics?: boolean
}

export function MapView({
  clinicsUrl = '/api/professionals/clinics',
  lawyersUrl = '/api/professionals/lawyers',
  showLawyers: showLawyersProp = true,
  showClinics: showClinicsProp = true,
}: MapViewProps = {}) {
  const { data: session } = useSession()
  const [clinics, setClinics] = useState<DecoratedClinic[]>([])
  const [lawyers, setLawyers] = useState<DecoratedLawyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [selectedLawyer, setSelectedLawyer] = useState<Lawyer | null>(null)
  const [selectedTargetClinic, setSelectedTargetClinic] = useState<Clinic | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showClinicModal, setShowClinicModal] = useState(false)
  const [showSpecialistModal, setShowSpecialistModal] = useState(false)

  const [filterText, setFilterText] = useState('')
  /**
   * On by default. This is a referral tool: offering a provider who is not
   * accepting referrals wastes the one action the screen exists for. The
   * summary line always says the filter is on and clears it in one click.
   */
  const [showAvailableOnly, setShowAvailableOnly] = useState(true)
  /** Phone only — the filter block is collapsed behind a button. */
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)
  /**
   * `'auto'` keeps the behaviour that was hardwired before: relevance while
   * there is a query, distance otherwise. It stays as a real, named option so
   * choosing an explicit order is a decision the user makes rather than one
   * they trip over — and so the heading can never disagree with the ordering.
   */
  const [sortMode, setSortMode] = useState<SortMode | 'auto'>('auto')
  const [showClinics, setShowClinics] = useState(showClinicsProp)
  const [showLawyers, setShowLawyers] = useState(showLawyersProp)
  const [locationQuery, setLocationQuery] = useState('')
  // Selected specialty / practice-area chips, applied as a filter.
  const [tagFilters, setTagFilters] = useState<string[]>([])
  /** What 'auto' resolves to right now. Also what the panel heading says. */
  const effectiveSort: SortMode =
    sortMode !== 'auto' ? sortMode : filterText.trim() ? 'relevance' : 'distance'
  const [locating, setLocating] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
  // Kept beside the label rather than replacing it: the label is the one-line
  // form the URL, the copied list and the summary need, while the anchor row
  // renders the components on two lines.
  const [locationAddress, setLocationAddress] = useState<GeocodeAddress | null>(null)
  /**
   * How sure the provider was about this point.
   *
   * Drives the "drag the pin" prompt on the chip. Without it a ZIP centroid and
   * a rooftop hit look identical, and every distance in the panel is measured
   * from the difference without saying so.
   */
  const [locationPrecision, setLocationPrecision] = useState<GeocodePrecision | null>(null)
  /**
   * The dropdown offered "place the pin yourself" and the user took it. The
   * next click on the map sets the anchor.
   */
  const [placingPin, setPlacingPin] = useState(false)
  // Anchor point for "clinics near the client's home": the searched/geolocated coordinates.
  const [searchedLocation, setSearchedLocation] = useState<[number, number] | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  /** The pin has been moved off what the search returned. */
  const [anchorAdjusted, setAnchorAdjusted] = useState(false)
  /**
   * Where the search originally put the pin, kept so a nudge is undoable.
   *
   * This matters more here than on a general-purpose map: the anchor decides
   * which clinics count as nearest for a specific client, and an accidental
   * drag would quietly re-rank the list with nothing on screen admitting it
   * had moved.
   */
  const [searchedOrigin, setSearchedOrigin] = useState<{
    position: [number, number]
    label: string
    address: GeocodeAddress | null
  } | null>(null)
  const autoSelectRef = useRef(false)
  /** Blocks URL writes until the incoming query string has been consumed. */
  const hydratedRef = useRef(false)
  /** Set before any move we initiate, so `moveend` can tell it apart from a pan. */
  const programmaticMoveRef = useRef(false)
  /**
   * Whether the user has moved the map themselves.
   *
   * Read by the opening-view fetch below, which costs a database round trip and
   * must not yank somebody back home from wherever they had already panned to
   * while it was in flight.
   */
  const userMovedRef = useRef(false)
  const mapShellRef = useRef<HTMLDivElement>(null)
  /** Handles for the two things a drag moves without re-rendering React. */
  const circleRef = useRef<L.Circle | null>(null)
  const homeMarkerRef = useRef<L.Marker | null>(null)
  const router = useRouter()
  const userState = session?.user?.state
  const stateConfig = userState ? STATE_MAP_CONFIG[userState] : undefined
  const initialCenter = stateConfig?.center ?? US_DEFAULT_CENTER
  const initialZoom = stateConfig?.zoom ?? US_DEFAULT_ZOOM
  /**
   * Open where the user works, not on the middle of the country.
   *
   * `STATE_MAP_CONFIG` covers the case where the session carries a state, and
   * a state centroid is already much better than the continent. But a state is
   * optional on a user, and the account this was reported from has none — so it
   * fell all the way through to `US_DEFAULT_CENTER` and opened on Winnipeg to
   * Bermuda with six hundred clinics as blue bubbles.
   *
   * The firm or clinic the user belongs to knows better than either. Fetched
   * rather than read off the session, because the session carries the id and
   * not the coordinates.
   *
   * Never overrides a link. A URL that names a place is a deliberate
   * instruction from whoever shared it, and arriving somewhere else would make
   * every shared map wrong.
   */
  useEffect(() => {
    let cancelled = false
    fetch('/api/me/location')
      .then((res) => (res.ok ? res.json() : null))
      .then((home: { lat?: number; lng?: number } | null) => {
        if (cancelled || !home?.lat || !home?.lng) return
        // A link, a search or a pin that arrived first wins.
        if (pendingFrameRef.current || searchedLocation || viewportBounds) return
        if (userMovedRef.current) return
        setAppliedCenter([home.lat, home.lng])
        // Parked rather than applied, for the same reason `?at=` is:
        // react-leaflet assigns `mapRef` when it creates the map, which is not
        // a render this effect can see. Calling `setView` here moved the
        // distances to Miami and left the camera on the whole country — a panel
        // and a map disagreeing about where the user is, which is worse than
        // either being wrong on its own.
        pendingFrameRef.current = { at: [home.lat, home.lng], radius: HOME_RADIUS_MILES }
      })
      .catch(() => {
        /* The country-wide view is the fallback, and it still works. */
      })
    return () => {
      cancelled = true
    }
    // Once, on mount. Anything the user does afterwards outranks it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [showPanel, setShowPanel] = useState(false)

  /**
   * Two independent spatial ideas, kept apart on purpose.
   *
   *   anchor   where distances are measured FROM — the searched client address,
   *            or the last centre the user explicitly settled on
   *   viewport which records are INCLUDED — only ever set by "Search this area"
   *
   * They used to be fused — and worse, broken. Distances were measured from
   * `searchedLocation ?? mapCentre`, but `mapCentre` never actually updated:
   * the `moveend` listener was attached in `whenReady` via
   * `mapRef.current?.on(...)`, and the ref was still null at that point, so the
   * optional chaining silently dropped it. The result was that with no address
   * searched, every "X mi away" figure was measured from the state's default
   * centroid rather than from anywhere the user had been.
   */
  const [appliedCenter, setAppliedCenter] = useState<[number, number]>(initialCenter)

  /**
   * A deliberately coarse view hint, sent with address lookups so the provider
   * ranks what the user is looking at first.
   *
   * Declared up here with the rest of the state rather than beside
   * `handleMapMoveEnd`, which is where it is written: `useSmartSearch` reads it
   * several hundred lines above that, and a `const` used before its declaration
   * is a temporal-dead-zone error at runtime, not a lint warning.
   *
   * This is state, unlike the zoom that `publishZoom` writes straight to the
   * DOM, and only because it is QUANTISED first: one decimal of latitude is
   * ~11 km and zoom moves in steps of two, so the value changes on the order of
   * once per deliberate move rather than once per frame. The `prev` comparison
   * below is what enforces that — without it this would re-render the map on
   * every pan, which is exactly the cost `mapCenter` used to impose before it
   * was removed.
   *
   * Coarse also keeps the cache useful: the hint is part of the cache key, so
   * full-precision coordinates would give every pixel of pan its own entry.
   */
  const [proximity, setProximity] = useState<ProximityHint | null>(null)

  const syncProximity = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const centre = map.getCenter()
    const next = quantizeProximity(centre.lat, centre.lng, map.getZoom())
    setProximity((prev) =>
      prev && prev.lat === next.lat && prev.lng === next.lng && prev.zoom === next.zoom
        ? prev
        : next
    )
  }, [])
  const [viewportBounds, setViewportBounds] = useState<Bounds | null>(null)
  const [mapMoved, setMapMoved] = useState(false)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Scroll request for the results list, raised only by map interaction. */
  const [scrollTo, setScrollTo] = useState<ScrollRequest | null>(null)

  /**
   * A selection restored from `?sel=` that has not been shown yet.
   *
   * `setSelectedId` alone left the pin unpainted and the row somewhere in an
   * unscrolled virtual list, so a link that carried a selection -- and every
   * selection is serialised into the URL -- opened looking like nothing had
   * been shared at all. One-shot: cleared as soon as it is honoured, so it
   * never fights a later click.
   */
  const pendingSelectRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * A view a shared link asked for that has not been shown yet.
   *
   * Same shape and same reason as `pendingSelectRef`: URL hydration runs on
   * mount, and while the data is loading `MapContainer` has not been
   * rendered, so there is no map to move.
   */
  const pendingFrameRef = useRef<{ at: [number, number]; radius: number | null } | null>(null)

  /**
   * The record the panel is showing in full, if any.
   *
   * An id rather than the item, so it survives the results being refiltered
   * underneath it: `panelItems` is a memo, and holding the object would pin
   * a stale copy of a record whose distance and availability move.
   */
  const [detailId, setDetailId] = useState<string | null>(null)

  /**
   * A record the user named that the current filters exclude.
   *
   * Set only by the entity branch of `handleSuggestionSelect`. Naming a
   * provider is an unambiguous intent, so the map goes there either way -- but
   * the results panel will not contain it, and an empty-looking panel after a
   * successful search is the kind of thing people read as broken. Clearing
   * their filters for them would be worse: this codebase rejects that move
   * everywhere else it comes up.
   */
  const [hiddenByFilters, setHiddenByFilters] = useState<{ id: string; name: string } | null>(null)
  /** Phone-only: how far the results sheet is pulled up. */
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek')

  // The sheet and the docked panel need genuinely different markup, which no
  // media query can express. Safe here because the map never renders on the
  // server, so there is no hydration mismatch to worry about.
  const isPhone = useMediaQuery('(max-width: 639px)')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const useSheet = isPhone
  const panelDocked = isDesktop
  /**
   * Draws the eye to the results toggle when a search has produced results the
   * user cannot currently see. Without it, collapsing the panel means new
   * results land silently behind a button with no indication anything changed.
   */
  const [panelAttention, setPanelAttention] = useState(false)
  const panelDefaultedRef = useRef(false)
  const previousTotalRef = useRef(0)

  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<MarkerRegistry | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      if (showClinicsProp) {
        const clinicsRes = await fetch(clinicsUrl)
        if (!clinicsRes.ok) throw new Error()
        setClinics(await clinicsRes.json())
      }
      if (showLawyersProp) {
        const lawyersRes = await fetch(lawyersUrl)
        if (lawyersRes.ok) {
          setLawyers(await lawyersRes.json())
        }
      }
    } catch { setError(true) } finally { setLoading(false) }
  }, [clinicsUrl, lawyersUrl, showLawyersProp, showClinicsProp])

  useEffect(() => { fetchData() }, [fetchData])

  // Restore shared state from the query string, once, on mount.
  //
  // Read from `window.location.search` rather than `useSearchParams` because
  // the page renders with `ssr: false`; the hook would demand a Suspense
  // boundary for no benefit here.
  useEffect(() => {
    const state = parseMapUrlState(new URLSearchParams(window.location.search))

    if (state.q) setFilterText(state.q)
    if (state.tags) setTagFilters(state.tags)
    if (state.availableOnly) setShowAvailableOnly(true)
    if (state.types) {
      setShowClinics(state.types.includes('clinic'))
      setShowLawyers(state.types.includes('lawyer'))
    }
    if (state.sort) setSortMode(state.sort)
    if (state.radius) setRadiusMiles(state.radius)
    if (state.bbox) setViewportBounds(state.bbox)
    if (state.selected) {
      setSelectedId(state.selected)
      // Painting the pin and scrolling the list cannot happen yet: the
      // results are not loaded and the markers are not on the map. Parked
      // for the effect below, which is the difference between a shareable
      // link and a link that looks broken.
      pendingSelectRef.current = state.selected
    }

    if (state.at) {
      // Already resolved, so skip the geocoder entirely — a shared link lands
      // instantly and does not depend on a third party still being up.
      setSearchedLocation(state.at)
      setAppliedCenter(state.at)
      setLocationLabel(state.near ?? 'Shared location')
      // ...and point the camera at it. Setting the anchor alone left the panel
      // listing clinics five miles from Bradenton while the map showed the
      // whole country — and, because the view then disagreed with the applied
      // centre, raised "Search this area" over the top of it. Deferred, because
      // there is no map to move yet: the loading state returns before
      // `MapContainer` is rendered at all.
      pendingFrameRef.current = { at: state.at, radius: state.radius ?? null }
    } else if (state.near && state.near.length >= 3) {
      // The original contract: geocode the address text and auto-select the
      // first match, so "View clinics near this client" from a referral lands
      // on a ready-to-use map rather than an open dropdown.
      autoSelectRef.current = true
      setLocationQuery(state.near)
    }

    hydratedRef.current = true
  }, [])

  // Address lookup goes through /api/geocode, which sets a real User-Agent,
  // caches server-side and keeps clients' home addresses off a third party.
  const { lookup: lookupAddress, loading: reverseLoading } = useReverseGeocode()

  const applyPlace = useCallback(
    (
      lat: number,
      lng: number,
      label: string,
      zoom: number,
      address: GeocodeAddress | null = null,
      bbox: GeocodeResult['bbox'] = null,
      precision: GeocodePrecision | null = null
    ) => {
      setSearchedLocation([lat, lng])
      setLocationLabel(label)
      setLocationAddress(address)
      setLocationPrecision(precision)
      setPlacingPin(false)
      setLocationQuery('')
      // Distances are measured from the anchor, and "Search this area" compares
      // the live centre against this. It was never updated here, so the pill
      // appeared the instant you picked any address — the map had "moved" from
      // wherever it had been before.
      setAppliedCenter([lat, lng])
      setMapMoved(false)
      // Remember where the search put it, so dragging is reversible.
      setSearchedOrigin({ position: [lat, lng], label, address })
      setAnchorAdjusted(false)

      programmaticMoveRef.current = true
      const map = mapRef.current
      if (bbox) {
        // Frame the place's real extent rather than a canned zoom — but only as
        // a ceiling. Nominatim's city boxes are frequently county-sized, and an
        // unbounded fit is worse than the fixed zoom it replaces.
        map?.fitBounds(toLatLngBounds(bbox), {
          maxZoom: zoom,
          padding: [40, 40],
          animate: !prefersReducedMotion(),
        })
      } else {
        map?.setView([lat, lng], zoom, { animate: !prefersReducedMotion() })
      }
    },
    []
  )

  const handleSelectSuggestion = useCallback(
    (s: GeocodeResult) => {
      // A ZIP covers far more ground than a street address; landing at street
      // zoom on a ZIP search hides most of what was asked for.
      //
      // The label arrives already composed from the geocoder's structured
      // components. It used to be re-truncated here to two comma parts, which
      // undid that work and produced a different label from the one the dropdown
      // path produced for the very same address.
      applyPlace(s.lat, s.lng, s.label, ZOOM_FOR_KIND[s.kind], s.address, s.bbox, s.precision)
    },
    [applyPlace]
  )

  /**
   * Moving the home pin.
   *
   * The anchor is where every distance is measured from, so a drag re-sorts the
   * whole list — which is exactly why it must not run per frame. Leaflet fires
   * `drag` on every pointer move; committing that to React state would rebuild
   * the search index and re-render several hundred markers dozens of times a
   * second.
   *
   * So the live feedback is imperative: the radius circle is moved directly
   * through its Leaflet handle, no React involved. State is committed once, on
   * drop, and only then does anything re-rank.
   */
  const handleAnchorDragStart = useCallback((event: L.LeafletEvent) => {
    // Imperative, and deliberately so. Setting React state here would swap the
    // icon, and `setIcon` replaces the marker's DOM element — the very element
    // Leaflet's active drag handler is bound to — so the drag dies mid-gesture
    // and `dragend` never fires. Found the hard way: the pin lifted correctly
    // and the drop went nowhere.
    ;(event.target as L.Marker).getElement()?.classList.add('xc-home-pin--dragging')
  }, [])

  const handleAnchorDrag = useCallback((event: L.LeafletEvent) => {
    const next = (event.target as L.Marker).getLatLng()
    circleRef.current?.setLatLng(next)
  }, [])

  const commitAnchor = useCallback(
    async (lat: number, lng: number) => {
      setSearchedLocation([lat, lng])
      setAppliedCenter([lat, lng])
      // The pin moved, not the map. Offering "search this area" here would be
      // answering a question nobody asked.
      setMapMoved(false)

      // Say something immediately rather than leaving the old address sitting
      // under a pin that has moved off it.
      setLocationAddress(null)
      setLocationLabel('Adjusting…')
      // Whatever the search claimed about precision no longer describes this
      // point. Dropping it also suppresses the "drag the pin" prompt, which has
      // been answered by the act of dragging.
      setLocationPrecision(null)

      const place = await lookupAddress(lat, lng)
      if (place) {
        setLocationLabel(place.label)
        setLocationAddress(place.address)
      } else {
        // Open water, a field, a lookup that failed. The pin is still exactly
        // where it was put; only the name for it is unknown, and saying so is
        // better than naming the building it used to be on.
        setLocationLabel('Custom location')
        setLocationAddress(null)
      }
    },
    [lookupAddress]
  )

  const handleAnchorDragEnd = useCallback(
    (event: L.LeafletEvent) => {
      const marker = event.target as L.Marker
      marker.getElement()?.classList.remove('xc-home-pin--dragging')
      const { lat, lng } = marker.getLatLng()
      setAnchorAdjusted(true)
      void commitAnchor(lat, lng)
    },
    [commitAnchor]
  )

  /**
   * Arrow keys nudge the focused pin.
   *
   * Dragging is a pointer gesture; without this the precision the feature
   * exists for is unavailable to anyone using a keyboard. The step scales with
   * zoom so one press is always a similar distance on screen rather than a
   * jump across the county at street level, or an invisible twitch at state
   * level. Shift moves ten times as far.
   */
  const handleAnchorKeyDown = useCallback(
    (event: L.LeafletEvent) => {
      const key = (event as unknown as L.LeafletKeyboardEvent).originalEvent?.key
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      const delta = key ? deltas[key] : undefined
      if (!delta) return

      const original = (event as unknown as L.LeafletKeyboardEvent).originalEvent
      original.preventDefault()
      // Or the map pans underneath at the same time.
      original.stopPropagation()

      const marker = event.target as L.Marker
      const map = mapRef.current
      if (!map) return

      const zoom = map.getZoom()
      // ~2px on screen per press, whatever the zoom.
      const step = (original.shiftKey ? 10 : 1) * (360 / 256 / Math.pow(2, zoom)) * 2
      const current = marker.getLatLng()
      const next = L.latLng(current.lat + delta[0] * step, current.lng + delta[1] * step)

      marker.setLatLng(next)
      circleRef.current?.setLatLng(next)
      setAnchorAdjusted(true)
      void commitAnchor(next.lat, next.lng)
    },
    [commitAnchor]
  )

  /** Put the pin back where the search put it. */
  const handleResetAnchor = useCallback(() => {
    if (!searchedOrigin) return
    setAnchorAdjusted(false)
    setLocationLabel(searchedOrigin.label)
    setLocationAddress(searchedOrigin.address)
    setSearchedLocation(searchedOrigin.position)
    setAppliedCenter(searchedOrigin.position)
    setMapMoved(false)
    programmaticMoveRef.current = true
    mapRef.current?.setView(searchedOrigin.position, mapRef.current.getZoom(), {
      animate: !prefersReducedMotion(),
    })
  }, [searchedOrigin])

  /**
   * Re-scope to the viewport on every pan, instead of offering to.
   *
   * Off by default, and deliberately so: a list that reshuffles under your
   * thumb while you are still moving the map is disorienting, and the manual
   * pill is the safer thing to meet first. But once someone is sweeping a
   * corridor -- which is what a lawyer looking for a clinic near a client
   * actually does -- confirming every single pan is the tax, so the preference
   * is remembered.
   */
  const [autoSearchArea, setAutoSearchArea] = useState(false)

  /**
   * Whether the user has panned this map themselves, even once.
   *
   * Gates the follow-the-map switch, and it has to be something other than the
   * switch's own value or the control unmounts the instant you turn it off:
   * the setting went false, the condition that rendered it went false with it,
   * and the checkbox you had just clicked vanished from under the cursor with
   * no way back short of panning again. Caught by driving it rather than by
   * reading it.
   */
  const [hasPanned, setHasPanned] = useState(false)

  /**
   * Whether the search box is open, which on a phone means the search takes
   * over the screen.
   *
   * On a 390px phone the box was a 250px field in a card floating over a map,
   * with a dropdown capped at 22rem competing with the pins behind it for the
   * reader's attention. It is the single most-used control on the page and it
   * had the least room of anything. Full screen while you are searching is
   * what every map application does on a phone, and it costs nothing here: the
   * SAME input node grows into the screen, so focus, the ARIA combobox
   * contract and every test that addresses `map-search-input` are untouched.
   */
  const [searchOpen, setSearchOpen] = useState(false)

  /** Phone only. On a tablet or wider the dropdown has room to just be a dropdown. */
  const searchTakeover = isPhone && searchOpen

  // Read through a ref: the `moveend` listener is bound once when the map is
  // ready, so a value captured in the closure would be frozen at whatever the
  // setting was at mount. The same reason `appliedCenterRef` exists.
  const autoSearchAreaRef = useRef(autoSearchArea)
  autoSearchAreaRef.current = autoSearchArea

  useEffect(() => {
    let stored = false
    try {
      stored = window.localStorage.getItem('xc:map-auto-area') === '1'
    } catch {
      // Storage disabled; the preference simply will not persist.
    }
    setAutoSearchArea(stored)
    // Show the switch straight away when the setting comes back on, rather
    // than waiting for a pan. Otherwise the mode is live and invisible: the
    // next drag silently re-scopes the whole list and the only control that
    // explains why has not been rendered yet.
    if (stored) setHasPanned(true)
  }, [])

  /**
   * Reached from `moveend`, which is bound once and cannot see a later
   * `useCallback`, and from `setAutoArea`, which is declared above the handler
   * so that `applyRadius` can retire the setting. A ref rather than a
   * dependency because re-binding the Leaflet listener on every render is what
   * `MapEvents` exists to avoid.
   */
  const searchThisAreaRef = useRef<() => void>(() => {})

  /**
   * The one control for "follow the map". Turning it on re-scopes immediately —
   * a switch that takes effect only on your NEXT pan looks broken — and turning
   * it off releases the viewport, so the user never has to find and press a
   * second control to undo what this one did.
   */
  const setAutoArea = useCallback(
    (next: boolean) => {
      setAutoSearchArea(next)
      try {
        window.localStorage.setItem('xc:map-auto-area', next ? '1' : '0')
      } catch {
        // Storage disabled; the preference simply will not persist.
      }
      if (next) searchThisAreaRef.current()
      else setViewportBounds(null)
      setMapMoved(false)
    },
    []
  )

  /**
   * Frame the radius the user just chose.
   *
   * Changing 5 mi to 50 mi used to alter nothing on screen but a small number:
   * same centre, same zoom, same pins in view, while the list quietly grew from
   * 16 to 65. The map is the one thing on this page that can show what a radius
   * means, and it was the one thing that did not react.
   */
  const applyRadius = useCallback(
    (miles: number | null) => {
      setRadiusMiles(miles)
      // A radius and a live viewport are two competing answers to "how far out
      // are we looking?", which is why handleSearchThisArea clears the radius.
      // The same has to hold in this direction, or the next pan would silently
      // throw away the radius the user just chose.
      if (miles) setAutoArea(false)
      if (!miles || !searchedLocation || !mapRef.current) return
      programmaticMoveRef.current = true
      mapRef.current.fitBounds(radiusBounds(searchedLocation, miles), {
        padding: [30, 30],
        animate: !prefersReducedMotion(),
      })
    },
    [searchedLocation, setAutoArea]
  )

  /**
   * Resolves the `?near=<address>` deep link, exactly once.
   *
   * `ReferrerReferralForm` depends on this: "View clinics near this client"
   * must land on a ready-to-use map, not on an open dropdown. It used to be
   * served by a SECOND `useGeocoder` instance that lived for the whole session
   * in order to answer one question at mount, plus an `autoSelectRef` that
   * fished the first result out of it as it arrived. `resolveOnce` is the same
   * contract without the machinery — and the contract matters, because the deep
   * link has URLs in circulation and two E2E specs pinning it.
   */
  useEffect(() => {
    if (!autoSelectRef.current || locationQuery.trim().length < MIN_GEOCODE_QUERY) return
    autoSelectRef.current = false

    let cancelled = false
    const query = locationQuery
    resolveOnce(query).then((result) => {
      if (cancelled) return
      if (result) {
        handleSelectSuggestion(result)
        return
      }
      // The address on the referral cannot be resolved. Hand it to the search
      // box rather than silently doing nothing: the dropdown says which address
      // failed and offers to place the pin by hand, which is the only way
      // forward when the provider has never heard of the street.
      setLocationQuery('')
      setFilterText(query)
    })

    return () => {
      cancelled = true
    }
  }, [locationQuery, handleSelectSuggestion])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setSearchedLocation([latitude, longitude])
        setLocationLabel('My Location')
        setLocationPrecision(null)
        setPlacingPin(false)
        setAppliedCenter([latitude, longitude])
        setMapMoved(false)
        setAnchorAdjusted(false)
        setLocating(false)
        programmaticMoveRef.current = true
        mapRef.current?.setView([latitude, longitude], 12)

        // Name the place, and record it as the origin.
        //
        // Neither used to happen, so the chip read "My Location" with no second
        // line and no Undo — and dragging the pin from a geolocated start had
        // nothing to undo back to, which is the one case where a stray drag is
        // most likely, since the browser's fix can already be a block out.
        setSearchedOrigin({
          position: [latitude, longitude],
          label: 'My Location',
          address: null,
        })
        void lookupAddress(latitude, longitude).then((result) => {
          if (!result) return
          setLocationAddress(result.address)
          setLocationPrecision(result.precision)
          setSearchedOrigin({
            position: [latitude, longitude],
            label: 'My Location',
            address: result.address,
          })
        })
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }, [lookupAddress])

  /**
   * The user chose "place the pin yourself", then clicked the map.
   *
   * This is the escape hatch that turns an unresolvable address into work that
   * can continue — the exact case the client reported, where a real street is
   * simply absent from the provider's data. No provider switch removes the need
   * for it; it only makes it rarer.
   *
   * `locationPrecision` stays null rather than becoming 'rooftop': we know where
   * they clicked, not that a building is under it, and null is the value that
   * makes no claim either way. The reverse lookup that follows is for the label
   * only — the coordinates are already exactly what was asked for.
   */
  const handlePickPin = useCallback(
    (lat: number, lng: number) => {
      setPlacingPin(false)
      setSearchedLocation([lat, lng])
      setAppliedCenter([lat, lng])
      setMapMoved(false)
      setAnchorAdjusted(false)
      setLocationLabel('Custom location')
      setLocationAddress(null)
      setLocationPrecision(null)
      setSearchedOrigin({ position: [lat, lng], label: 'Custom location', address: null })

      void lookupAddress(lat, lng).then((result) => {
        if (!result) return
        setLocationLabel(result.label)
        setLocationAddress(result.address)
        setSearchedOrigin({ position: [lat, lng], label: result.label, address: result.address })
      })
    },
    [lookupAddress]
  )

  const handleClearLocation = useCallback(() => {
    setLocationLabel(''); setLocationAddress(null); setLocationQuery(''); setSearchedLocation(null); setRadiusMiles(null)
    setLocationPrecision(null); setPlacingPin(false)
    // Clearing the location resets every spatial constraint, not just the pin —
    // leaving a stale viewport behind would keep filtering results against an
    // area the user can no longer see any reason for.
    setViewportBounds(null)
    setMapMoved(false)
    setAppliedCenter(initialCenter)
    mapRef.current?.setView(initialCenter, initialZoom)
  }, [initialCenter, initialZoom])


  const viewerClinicId = session?.user?.role === 'clinic' ? session?.user?.clinicId : undefined
  const isClinicViewer = session?.user?.role === 'clinic'

  // Distances anchor to the searched client address when there is one
  // ("3.2 mi from the client's home"), otherwise to the centre the user last
  // settled on — never to the live centre, which would move as they pan.
  const anchor = useMemo<[number, number]>(
    () => searchedLocation ?? appliedCenter,
    [searchedLocation, appliedCenter]
  )


  const {
    items: panelItems,
    total: resultTotal,
    facets,
    // Computed and verified by the engine since the search rebuild, returned by
    // this hook, and never once destructured here — so the empty panel showed a
    // hardcoded "try something else" while a checked suggestion sat unused.
    didYouMean,
    clinicCount,
    lawyerCount,
    byId,
    index: searchIndex,
  } = useMapSearch({
    clinics,
    lawyers,
    viewerClinicId,
    isClinicViewer,
    query: filterText,
    showClinics,
    showLawyers,
    availableOnly: showAvailableOnly,
    tags: tagFilters,
    anchor,
    // The radius only means anything relative to a deliberately chosen origin;
    // measuring it from wherever the map happens to sit would silently reshuffle
    // the list on every pan.
    radiusMiles: searchedLocation ? radiusMiles : null,
    bounds: viewportBounds,
    sort: effectiveSort,
  })

  /**
   * How many of each type the current query found, regardless of whether that
   * type is switched on.
   *
   * `clinicCount`/`lawyerCount` are counted from the rendered hits, so a type
   * that is toggled off reports 0 by construction — the chip displayed
   * "Attorneys 0" while the engine knew there were 47. `facets.types` is
   * computed with the type filter deliberately excluded, so it answers the
   * question the chip is actually asking: what do I get back if I turn this on?
   */
  const typeCount = useCallback(
    (type: 'clinic' | 'lawyer') => facets.types.find((t) => t.value === type)?.count ?? 0,
    [facets.types]
  )

  /**
   * The denominator for "16 of 118".
   *
   * Facets are counted over the hits that matched the TEXT and fell inside the
   * current area and radius, but before the chip filters are applied
   * (see `engine.ts`). Summing the per-type counts therefore answers "how many
   * did this search actually find around here", which is the honest thing to
   * compare the visible count against — and the number that tells someone
   * their filters are hiding things.
   */
  const areaTotal = useMemo(
    () => facets.types.reduce((sum, t) => sum + t.count, 0),
    [facets.types]
  )

  /** Whether the tag rail has more than it can show at its collapsed height. */
  const overflowTags = facets.tags.length > MAX_VISIBLE_TAGS

  /** Tags worth offering, most common first, with the selected ones pinned on. */
  const visibleTags = useMemo(() => {
    const selected = facets.tags.filter((t) => tagFilters.includes(t.value))
    const rest = facets.tags.filter((t) => !tagFilters.includes(t.value))
    const shown = showAllTags ? rest : rest.slice(0, Math.max(0, MAX_VISIBLE_TAGS - selected.length))
    return [...selected, ...shown]
  }, [facets.tags, tagFilters, showAllTags])

  /** Everything currently narrowing the list, so it can be undone in one go. */
  const activeFilterCount =
    tagFilters.length +
    (showAvailableOnly ? 1 : 0) +
    (showClinicsProp && !showClinics ? 1 : 0) +
    (showLawyersProp && !showLawyers ? 1 : 0)

  const handleClearFilters = useCallback(() => {
    setTagFilters([])
    setShowAvailableOnly(false)
    setShowClinics(showClinicsProp)
    setShowLawyers(showLawyersProp)
  }, [showClinicsProp, showLawyersProp])

  // Markers and the panel now render the exact same array, so the chip counts
  // and the list can no longer disagree.
  const visibleItems = panelItems

  const handleCopyList = useCallback(async () => {
    if (panelItems.length === 0) return
    const origin = locationLabel || 'the selected location'
    // The panel can hold clinics, attorneys or both — label it accordingly
    // instead of always claiming "Clinics".
    const hasClinic = panelItems.some((it) => it.type === 'clinic')
    const hasLawyer = panelItems.some((it) => it.type === 'lawyer')
    const label = hasClinic && hasLawyer ? 'Providers' : hasLawyer ? 'Attorneys' : 'Clinics'
    const header = `${label} near ${origin}${radiusMiles ? ` (within ${radiusMiles} mi)` : ''}:`
    const lines = panelItems.map((it, i) => {
      const parts = [`${i + 1}. ${it.name} - ${it.distance.toFixed(1)} mi`]
      if (it.phone) parts.push(it.phone)
      const where = it.address ?? [it.city, it.state, it.zipCode].filter(Boolean).join(', ')
      if (where) parts.push(where)
      return parts.join(' - ')
    })
    try {
      await navigator.clipboard.writeText([header, '', ...lines].join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }, [panelItems, locationLabel, radiusMiles])

  /* ── Unified search box (feature-flagged) ── */

  const {
    groups: suggestionGroups,
    remember,
    forget,
    resolvePlace,
    resetSession,
  } = useSmartSearch({
    index: searchIndex,
    facets,
    query: filterText,
    anchor: searchedLocation,
    entityHeading: isClinicViewer ? 'Specialists' : 'Providers',
    categoryHeading: showLawyersProp ? 'Practice areas' : 'Specialties',
    hasAnchor: Boolean(locationLabel),
    proximity,
    // There is a map right here to point at, so an address the provider has
    // never heard of does not have to be a dead end.
    allowManualPin: true,
    allowGeolocate: true,
  })

  /**
   * Open the full record.
   *
   * Also selects it, so the pin is painted and the URL carries `sel`. A link
   * copied from here therefore lands the recipient on the same record with the
   * same filters and framing — SELECTED, not with the detail already open.
   *
   * That is deliberate rather than unfinished. Opening the detail from a link
   * would replace the list before the recipient has seen what the sender was
   * looking at, and `map-interaction.spec.ts` pins the current behaviour: a
   * shared link marks its row `aria-current`, which cannot be true if there
   * are no rows.
   */
  const handleOpenDetail = useCallback((item: MapItem) => {
    setDetailId(item.id)
    setSelectedId(item.id)
    markersRef.current?.setSelected(item.id)
    // Centre the pin, but do NOT open its popup: the popup says a shorter
    // version of what the panel is now showing in full, and on desktop it lands
    // over the map the user is trying to read it against.
    markersRef.current?.focus(item.id, { openPopup: false })
    if (window.matchMedia('(max-width: 639px)').matches) setSheetSnap('full')
  }, [])

  const handleCloseDetail = useCallback(() => setDetailId(null), [])

  const handleFocusItem = useCallback((item: MapItem) => {
    setSelectedId(item.id)
    markersRef.current?.setSelected(item.id)
    // Opens the pin's popup, spiderfying its cluster first if needed — the
    // panel used to only re-centre, leaving no sign of which result was picked.
    markersRef.current?.focus(item.id)
    // Get out of the way only where the panel covers the map. On a phone the
    // sheet drops to peek rather than vanishing, so the list is one drag away.
    if (window.matchMedia('(max-width: 639px)').matches) setSheetSnap('peek')
    else if (window.matchMedia('(max-width: 1023px)').matches) setShowPanel(false)
  }, [])

  /**
   * How many results the camera is allowed to frame.
   *
   * A search for "chiropractic" matches hundreds across two states; fitting all
   * of them puts the view back where it started, at the whole country. Framing
   * the nearest fifty answers the question the user is actually asking — where
   * are the ones I would use — and one outlier in Pensacola cannot drag the
   * camera off it.
   */
  const FIT_RESULTS = 50

  /**
   * Move the camera to where the results are.
   *
   * The gap this closes: committing a search did nothing spatially. Typing
   * "chiropractic" and pressing Enter filled the panel with four hundred rows
   * while the map sat on the state centroid, so the number told you how many
   * and the map told you nothing about where — which is the one thing a map is
   * for. "400 results" means something completely different when twelve are
   * near your client and when none are within sixty miles.
   *
   * Called only when the user COMMITS an intent, never on a keystroke. Panning
   * the map while someone is still typing is the silent reshuffle that
   * `map-search.spec.ts` was written to forbid.
   */
  const fitResults = useCallback((items: readonly MapItem[]) => {
    const map = mapRef.current
    if (!map || items.length === 0) return

    // A radius search has already been framed by `applyRadius`, and re-framing
    // it to the results would quietly contradict the circle drawn on screen.
    if (searchedLocation && radiusMiles) return

    programmaticMoveRef.current = true

    if (items.length === 1) {
      map.setView([items[0].lat, items[0].lng], 14, { animate: !prefersReducedMotion() })
      return
    }

    const bounds = L.latLngBounds(
      items.slice(0, FIT_RESULTS).map((item) => [item.lat, item.lng] as [number, number])
    )
    map.fitBounds(bounds, {
      maxZoom: 14,
      padding: [48, 48],
      animate: !prefersReducedMotion(),
    })
  }, [searchedLocation, radiusMiles])

  /**
   * Ask for a fit on the NEXT render, once the results have caught up.
   *
   * Choosing a specialty calls `setTagFilters`, and `panelItems` is a memo
   * derived from that state — so calling `fitResults(panelItems)` in the same
   * handler frames the results the filter was about to replace. A bump-a-nonce
   * effect reads whatever `panelItems` has become, and fires even when the
   * result set happens not to have changed, which an effect keyed on
   * `panelItems` would not.
   */
  const [fitNonce, setFitNonce] = useState(0)
  const requestFit = useCallback(() => setFitNonce((n) => n + 1), [])

  useEffect(() => {
    if (fitNonce === 0) return
    fitResults(panelItems)
    // `panelItems` is deliberately not a dependency: this must fire when a fit
    // is REQUESTED, not whenever the results happen to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce])

  /**
   * Show the selection a shared link asked for, once there is something to
   * show it on.
   *
   * Waits for results because `markers.focus` needs the marker to exist and
   * `scrollTo` needs the row to be in the list. Runs at most once.
   */
  useEffect(() => {
    const id = pendingSelectRef.current
    if (!id || panelItems.length === 0) return
    const item = panelItems.find((candidate) => candidate.id === id)
    // Gone, or filtered out by the same link that named it. Drop the request
    // rather than retrying on every result change for the rest of the session.
    pendingSelectRef.current = null
    if (!item) return
    markersRef.current?.setSelected(id)
    markersRef.current?.focus(id)
    setScrollTo((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }))
  }, [panelItems])

  /**
   * Frame the location a shared link named, once there is a map to frame it
   * on. Runs at most once.
   *
   * Keyed on `panelItems` rather than `loading`, and that is not arbitrary:
   * react-leaflet assigns `mapRef` when the map instance is created, which is
   * not the same render as the one where `loading` turns false. Waiting for
   * results waits for something that cannot happen before the map exists.
   */
  useEffect(() => {
    const pending = pendingFrameRef.current
    const map = mapRef.current
    if (!pending || !map) return
    pendingFrameRef.current = null

    programmaticMoveRef.current = true
    const [lat, lng] = pending.at
    if (pending.radius) {
      // Show the whole circle the link asked for, not an arbitrary zoom that
      // happens to contain its centre.
      map.fitBounds(radiusBounds([lat, lng], pending.radius), {
        padding: [40, 40],
        animate: false,
      })
    } else {
      map.setView([lat, lng], ZOOM_FOR_KIND.address, { animate: false })
    }
  }, [panelItems])

  const handleSuggestionSelect = useCallback(
    async (suggestion: Suggestion) => {
      const { payload } = suggestion
      switch (payload.kind) {
        case 'place': {
          // Google and Mapbox return suggestions WITHOUT coordinates — that
          // split is how they bill one session rather than N keystrokes — so a
          // row is not a location until it has been resolved. Nominatim answers
          // from the suggestion it already has.
          const place = await resolvePlace(payload.suggestion)
          if (!place) {
            // Leave the text alone. Clearing it here would make a transient
            // network failure look like the user mistyped.
            return
          }
          remember(place.label, { lat: place.lat, lng: place.lng, label: place.label })
          setFilterText('')
          // Passing `address` and `bbox` through is the whole point of carrying
          // the suggestion object. This call site used to pass neither, so the
          // map never framed the bounding box it had been handed and the
          // location chip rendered one line where it was built for two — while
          // the `?near=` path, which did pass them, behaved correctly for the
          // very same address.
          applyPlace(
            place.lat,
            place.lng,
            place.label,
            ZOOM_FOR_KIND[place.kind],
            place.address,
            place.bbox,
            place.precision
          )
          return
        }
        case 'geolocate':
          // The same action the corner button performs. One implementation,
          // two ways in.
          setFilterText('')
          handleGeolocate()
          return
        case 'manual':
          // Arm the map. The next click sets the anchor, and the pin is
          // draggable from there like any other.
          setFilterText('')
          resetSession()
          setPlacingPin(true)
          setShowPanel(false)
          return
        case 'entity': {
          // Jump to the record itself and open its popup, rather than merely
          // filtering the list down to it.
          //
          // Three things were wrong here and they compounded. The handler
          // resolved the id against `byId`, which holds only the FILTERED
          // results, while `suggestEntities` ignores filters on purpose -- so
          // with Attorneys off, a radius set, or "This area only" active, this
          // hit `if (!item) return` and the click did nothing at all. When it
          // did resolve it contradicted the comment above: `setView` only, no
          // selection and no popup. And it never marked the move as
          // programmatic, so a jump of more than MOVED_THRESHOLD_MILES raised
          // "Search this area" immediately after the action that framed it.
          //
          // The payload now carries its own coordinates, so the jump never
          // depends on the lookup succeeding. Whether the record is in the
          // current results becomes something to SAY rather than a reason to
          // do nothing.
          remember(payload.name)
          setFilterText('')
          programmaticMoveRef.current = true

          const item = byId.get(payload.id)
          if (item) {
            setHiddenByFilters(null)
            handleFocusItem(item)
            return
          }

          // Asked for by name, excluded by a filter the user set earlier and
          // may well have forgotten. Go there anyway -- naming a record is a
          // clear enough intent -- and offer the way back rather than
          // silently clearing filters on their behalf.
          mapRef.current?.setView([payload.lat, payload.lng], 15)
          setHiddenByFilters({ id: payload.id, name: payload.name })
          return
        }
        case 'category':
          // A category is a filter, not a text query — keeping it out of the
          // box means it survives whatever is typed next.
          setFilterText('')
          setTagFilters((current) =>
            current.includes(payload.tag) ? current : [...current, payload.tag]
          )
          // Choosing a specialty is a commit like pressing Enter, so the map
          // follows. Deferred, because the filter has not been applied yet.
          requestFit()
          return
        case 'recent': {
          /**
           * Go back to the search, not just to the words.
           *
           * A recent row shows the place it was anchored to as its subtitle, and
           * choosing it only set the query text — so picking "862 62nd St Cir E ·
           * Bradenton" filtered the current results by the string "862 62nd St
           * Cir E", matched no provider name, and emptied the panel. The user
           * reported it as "nothing happens", which is the right description of
           * an interface that offers a location and hands back a filter.
           *
           * With a place: restore the place, exactly as choosing it from the
           * Places group does — including clearing the text, because an address
           * is not a thing to filter provider names by.
           */
          if (payload.near) {
            setFilterText('')
            applyPlace(
              payload.near.lat,
              payload.near.lng,
              payload.near.label,
              ZOOM_FOR_KIND.address
            )
            return
          }
          // No place behind it: it really was just a text search.
          setFilterText(payload.query)
          requestFit()
          return
        }
      }
    },
    [remember, applyPlace, byId, resolvePlace, resetSession, handleFocusItem, requestFit, handleGeolocate]
  )

  const handleSuggestionRemove = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.payload.kind === 'recent') forget(suggestion.payload.query)
    },
    [forget]
  )


  const handleSearchSubmit = useCallback(
    (value: string) => {
      if (value.trim()) remember(value)
      setShowPanel(true)
      // On a phone, committing a search should reveal what it found.
      setSheetSnap((current) => (current === 'peek' ? 'half' : current))
      requestFit()
    },
    [remember, requestFit]
  )

  /* ── Shareable URL ── */

  const urlQuery = useMemo(
    () =>
      toMapUrlQuery({
        q: filterText.trim() || undefined,
        near: locationLabel || undefined,
        at: searchedLocation ?? undefined,
        radius: radiusMiles ?? undefined,
        bbox: viewportBounds ?? undefined,
        tags: tagFilters.length > 0 ? tagFilters : undefined,
        types:
          showClinics && showLawyers
            ? undefined
            : [
                ...(showClinics ? (['clinic'] as const) : []),
                ...(showLawyers ? (['lawyer'] as const) : []),
              ],
        availableOnly: showAvailableOnly || undefined,
        // Only once someone has actually chosen an order. Serialising the
        // resolved value would append `?sort=distance` to every visit, so a
        // plain map load would rewrite its own address bar.
        sort: sortMode === 'auto' ? undefined : sortMode,
        selected: selectedId ?? undefined,
      }),
    [
      filterText,
      locationLabel,
      searchedLocation,
      radiusMiles,
      viewportBounds,
      tagFilters,
      showClinics,
      showLawyers,
      showAvailableOnly,
      sortMode,
      selectedId,
    ]
  )

  // Debounced so typing does not write a history entry per keystroke, and
  // `replace` rather than `push` so the back button still leaves the map.
  const debouncedUrlQuery = useDebounce(urlQuery, 500)

  useEffect(() => {
    // Never write before the initial state has been read, or the first render
    // would wipe the very parameters it was handed.
    if (!hydratedRef.current) return
    const next = `${window.location.pathname}${debouncedUrlQuery}`
    if (next === `${window.location.pathname}${window.location.search}`) return
    router.replace(next, { scroll: false })
  }, [debouncedUrlQuery, router])

  /* ── Viewport scope ── */

  const handleSearchThisArea = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    // Pad slightly so pins just off the edge are not jarringly absent from a
    // list the user just asked to match what they can see.
    const bounds = map.getBounds().pad(0.1)
    const centre = map.getCenter()
    setViewportBounds({
      south: bounds.getSouth(),
      north: bounds.getNorth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
    })
    setAppliedCenter([centre.lat, centre.lng])
    // The viewport supersedes the radius; leaving both on would mean two
    // competing answers to "how far out are we looking?".
    setRadiusMiles(null)
    setMapMoved(false)
    setShowPanel(true)
  }, [])

  searchThisAreaRef.current = handleSearchThisArea

  const handleClearViewport = useCallback(() => {
    setViewportBounds(null)
    setMapMoved(false)
  }, [])

  /* ── Results panel visibility ── */

  const togglePanel = useCallback(() => {
    setShowPanel((current) => {
      const next = !current
      try {
        window.localStorage.setItem('xc:map-rail-open', next ? '1' : '0')
      } catch {
        // Storage disabled; the preference simply will not persist.
      }
      return next
    })
  }, [])

  // Open by default on a wide screen, where the list fits beside the map, and
  // remember whatever the user chooses after that.
  //
  // Reads `matchMedia` directly rather than the `isDesktop` hook value: that
  // hook starts at `false` and corrects itself in its own effect, so this one
  // ran first, latched "not desktop", and left the panel shut on every wide
  // screen. Two effects racing over the same question.
  useEffect(() => {
    if (panelDefaultedRef.current) return
    if (typeof window === 'undefined' || !window.matchMedia) return
    panelDefaultedRef.current = true

    if (window.matchMedia('(max-width: 639px)').matches) return

    let stored: string | null = null
    try {
        // A new key, not the old `xc:map-panel-open`.
        //
        // What the stored value MEANS changed: it used to hide a list of
        // results, and now it decides whether search and filters live in the
        // rail or float over the map. Anyone who had collapsed the old panel
        // would have opened the redesign to the layout they were trying to get
        // away from, and concluded nothing had changed.
      stored = window.localStorage.getItem('xc:map-rail-open')
    } catch {
      stored = null
    }
    setShowPanel(
      stored === null ? window.matchMedia('(min-width: 1024px)').matches : stored === '1'
    )
  }, [])

  // Flag new results the user cannot see, and stop as soon as they look.
  useEffect(() => {
    if (resultTotal === previousTotalRef.current) return
    previousTotalRef.current = resultTotal
    if (!showPanel && !useSheet && resultTotal > 0) setPanelAttention(true)
  }, [resultTotal, showPanel, useSheet])

  useEffect(() => {
    if (showPanel) setPanelAttention(false)
  }, [showPanel])

  // Leaflet caches its container size and only re-measures on a window resize.
  // Docking the panel changes the map's width through CSS, which Leaflet never
  // hears about, so it keeps drawing tiles for the old narrower viewport and
  // the newly exposed strip stays blank. Re-measure once the width transition
  // has finished.
  useEffect(() => {
    if (!panelDocked) return
    const map = mapRef.current
    if (!map) return
    map.invalidateSize()
    const timer = setTimeout(() => map.invalidateSize(), 350)
    return () => clearTimeout(timer)
  }, [showPanel, panelDocked])

  useEffect(() => {
    if (!panelAttention) return
    // Nudge, do not nag.
    const timer = setTimeout(() => setPanelAttention(false), 6000)
    return () => clearTimeout(timer)
  }, [panelAttention])

  /* ── Panel <-> map synchronisation ── */

  /**
   * Hover originating in the panel. Highlights the pin but must NOT scroll the
   * list: scrolling drags the cursor across rows, and letting that feed back
   * into a scroll made the panel impossible to move.
   */
  const handleHoverItem = useCallback((id: string | null) => {
    setHoveredId(id)
    markersRef.current?.setHovered(id)
  }, [])

  /** Hover originating on the map. This one does scroll the list. */
  const handleMarkerHover = useCallback((id: string | null) => {
    setHoveredId(id)
    markersRef.current?.setHovered(id)
    if (id) setScrollTo((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }))
  }, [])

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id)
    markersRef.current?.setSelected(id)
    setScrollTo((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }))
  }, [])

  const handleReferral = useCallback((target: MapItem) => {
    mapRef.current?.closePopup()
    if (target.type === 'lawyer') {
      setSelectedLawyer(target as unknown as Lawyer)
      setShowClinicModal(true)
    } else if (isClinicViewer) {
      // Clinic referring a patient to ANOTHER clinic (medical specialist).
      setSelectedTargetClinic(target as unknown as Clinic)
      setShowSpecialistModal(true)
    } else {
      // Lawyer referring a patient to a clinic.
      setSelectedClinic(target as unknown as Clinic)
      setShowModal(true)
    }
  }, [isClinicViewer])
  const handleCloseModal = useCallback(() => { setShowModal(false); setSelectedClinic(null) }, [])
  const handleCloseClinicModal = useCallback(() => { setShowClinicModal(false); setSelectedLawyer(null) }, [])
  const handleCloseSpecialistModal = useCallback(() => { setShowSpecialistModal(false); setSelectedTargetClinic(null) }, [])
  // Read through a ref, because the `moveend` listener is bound once when the
  // map is ready and would otherwise keep comparing against whatever the
  // centre was at mount.
  const appliedCenterRef = useRef(appliedCenter)
  appliedCenterRef.current = appliedCenter

  /**
   * Publish the zoom on the DOM so a test can assert the map actually reframed.
   * Written imperatively rather than through state: this fires on every pan,
   * and re-rendering the whole map for a number nothing displays is exactly the
   * cost that `mapCenter` used to impose before it was removed.
   */
  const publishZoom = useCallback(() => {
    const map = mapRef.current
    if (map) mapShellRef.current?.setAttribute('data-zoom', String(map.getZoom()))
  }, [])

  const handleMapMoveEnd = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    publishZoom()
    syncProximity()

    // A move we made ourselves is not the user wandering off. Without this,
    // every `fitBounds` — picking a radius, choosing an address — ends in a
    // `moveend` that raises "Search this area", so the pill flashes up
    // immediately after the very action that framed the map correctly.
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false
      setMapMoved(false)
      return
    }

    // A move that reached here is the user's own. The opening-view fetch reads
    // this so it cannot snap them home from wherever they had already gone.
    userMovedRef.current = true
    setHasPanned(true)

    const centre = map.getCenter()
    // Offer to re-scope rather than doing it unasked.
    const [appliedLat, appliedLng] = appliedCenterRef.current
    const moved = haversineDistance(centre.lat, centre.lng, appliedLat, appliedLng)

    /**
     * Relative to what is on screen, not an absolute two miles.
     *
     * The intent behind the fixed threshold was right — a pill that appears
     * every time you click a pin is noise — but a viewport spans about 0.6
     * miles at street zoom and 300 at state zoom, so one number cannot serve
     * both. It made "Search this area" unreachable exactly where re-scoping
     * matters most: panning to a completely different neighbourhood at z16
     * moves well under two miles and offered nothing.
     *
     * A third of the visible width, with the old constant as a floor so the
     * tiny recentre after opening a popup still cannot raise it.
     */
    const bounds = map.getBounds()
    const spanMiles = haversineDistance(
      centre.lat,
      bounds.getWest(),
      centre.lat,
      bounds.getEast()
    )
    const threshold = Math.max(MOVED_THRESHOLD_MILES * 0.25, spanMiles * 0.3)
    if (moved <= threshold) {
      setMapMoved(false)
      return
    }

    // Same threshold either way. Re-running the search on a three-pixel nudge
    // would thrash the list for no gain, and the reason the pill uses a
    // proportion of the visible width rather than a fixed distance applies
    // exactly as much when nobody is being asked first.
    if (autoSearchAreaRef.current) {
      searchThisAreaRef.current()
      return
    }
    setMapMoved(true)
  }, [publishZoom, syncProximity])


  /**
   * `/` and Cmd/Ctrl-K put the cursor in the search box.
   *
   * The two shortcuts every search-first product has taught people to try.
   * Someone comparing four clinics does not want to travel back to a 420px
   * card in the top-left corner with the mouse each time.
   *
   * Four things it must not do, all of them ways a global key handler goes
   * wrong: swallow a slash somebody is typing into a field, fire underneath
   * an open referral modal, interrupt an IME composing a character, or
   * override the browser when a modifier the page has no claim on is held.
   */
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return
      if (showModal || showClinicModal || showSpecialistModal) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
      const cmdK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
      if (!slash && !cmdK) return

      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showModal, showClinicModal, showSpecialistModal])

  const userRole = session?.user?.role

  // The sheet and the docked panel need genuinely different markup, which no
  // media query can express. Safe here because the map never renders on the
  // server, so there is no hydration mismatch to worry about.

  /**
   * The summary now leads with the honest ratio.
   *
   * "16 results found" left the reader with no idea whether that was everything
   * or a sliver. `areaTotal` counts what the search found in this area BEFORE
   * the chip filters, so the difference is precisely what the user's own
   * filters are hiding.
   */
  const resultsSummary = `${panelItems.length}${
    areaTotal > panelItems.length ? ` of ${areaTotal}` : ''
  } ${panelItems.length === 1 ? 'result' : 'results'}${
    searchedLocation && locationLabel ? ` near ${locationLabel}` : ''
  }`

  /**
   * The next radius worth offering. Jumping straight to "Any" throws away the
   * spatial intent the user just expressed; one step out keeps it.
   */
  const nextRadius = radiusMiles
    ? ([5, 10, 25, 50] as const).find((r) => r > radiusMiles) ?? null
    : null

  /**
   * Where the providers actually are, when there are none here.
   *
   * "Nothing within 5 miles" plus a button that widens to 10 tells somebody how
   * to keep guessing. A lawyer whose client lives forty miles from the nearest
   * clinic needs a different sentence: the names of the places that do have one.
   *
   * The facets computed on every search cannot answer this. They are built from
   * `textMatched`, which `engine.ts` fills AFTER the bounds and radius checks —
   * so an empty spatial result has empty facets by construction. Asking
   * properly means asking again without the spatial filter, which is what
   * `verifiedCorrection` already does for "did you mean": one extra scan, on
   * the empty path only, buying an answer somebody can act on.
   */
  const elsewhere = useMemo(() => {
    if (panelItems.length > 0) return []
    if (!radiusMiles && !viewportBounds) return []

    const outcome = search(searchIndex, filterText, {
      anchor,
      // Sorted by distance and cut short, NOT `facets.cities`.
      //
      // The facet counts are ordered by how many providers a place has, which
      // is a different question and produced a confidently wrong answer: five
      // miles from Bradenton it offered "the nearest are in Gainesville and
      // Ocala" — sixteen clinics each, and both over a hundred miles away,
      // while Sarasota sat twelve miles off with fewer. The nearest results
      // know where the nearest results are.
      sort: 'distance',
      limit: 60,
      filters: {
        ...(showAvailableOnly ? { availableOnly: true } : {}),
        ...(tagFilters.length > 0 ? { tags: [...tagFilters] } : {}),
        types: [
          ...(showClinics ? (['clinic'] as const) : []),
          ...(showLawyers ? (['lawyer'] as const) : []),
        ],
      },
    })

    const seen = new Map<string, number>()
    for (const hit of outcome.hits) {
      const city = hit.doc.city
      if (!city || seen.has(city)) continue
      seen.set(city, hit.distance)
      if (seen.size === 2) break
    }
    return Array.from(seen, ([value, distance]) => ({ value, distance }))
  }, [
    panelItems.length,
    radiusMiles,
    viewportBounds,
    searchIndex,
    filterText,
    anchor,
    showAvailableOnly,
    tagFilters,
    showClinics,
    showLawyers,
  ])

  /**
   * A dead end with a way out of it.
   *
   * `didYouMean` is only produced when the engine has already re-run the search
   * with the correction and confirmed it returns MORE results, so proposing it
   * cannot lead to a second empty panel.
   */
  const emptyState = (
    <EmptyState
      icon={MapPin}
      title="No results found"
      hint={
        didYouMean
          ? undefined
          : elsewhere.length > 0
            ? // Says where they are, not just that they are not here.
              `The nearest are in ${elsewhere.map((c) => c.value).join(' and ')}.`
            : nextRadius
              ? `Nothing within ${radiusMiles} miles of here.`
              : 'Try a different search, or clear a filter.'
      }
      data-testid="map-panel-empty"
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {didYouMean && (
            <button
              type="button"
              onClick={() => setFilterText(didYouMean)}
              data-testid="map-did-you-mean"
              className="rounded-lg bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Did you mean <span className="italic">{didYouMean}</span>?
            </button>
          )}
          {elsewhere.map((city) => (
            <button
              key={city.value}
              type="button"
              onClick={() => {
                // Drop the spatial filter that produced the dead end and put
                // the city in the box. Widening the radius by one step would
                // often still not reach it, and clearing everything would
                // throw away the specialty they had already chosen.
                setRadiusMiles(null)
                setViewportBounds(null)
                setFilterText(city.value)
                requestFit()
              }}
              data-testid="map-empty-city"
              className="rounded-lg border border-navy/15 bg-navy/[0.04] px-3 py-1.5 text-[11px] font-semibold text-navy transition-colors hover:bg-navy/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {city.value}
              <span className="ml-1.5 tabular-nums text-navy/50">
                {city.distance.toFixed(0)} mi
              </span>
            </button>
          ))}
          {nextRadius && (
            <button
              type="button"
              onClick={() => applyRadius(nextRadius)}
              data-testid="map-widen-radius"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Widen to {nextRadius} mi
            </button>
          )}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              data-testid="map-empty-clear-filters"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Clear {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'}
            </button>
          )}
        </div>
      }
    />
  )

  /**
   * "You asked for this one and your filters exclude it."
   *
   * Sits above the list rather than inside the empty state, because the list is
   * usually NOT empty in this case -- the record the user named is simply not
   * in it, which is a more confusing thing to look at than nothing at all.
   */
  const hiddenNotice = hiddenByFilters && (
    <div
      data-testid="map-hidden-by-filters"
      role="status"
      className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50/70 px-5 py-2.5 text-[11px] leading-snug text-amber-900"
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{hiddenByFilters.name}</span> is hidden by your filters
      </span>
      <button
        type="button"
        onClick={() => {
          handleClearFilters()
          setHiddenByFilters(null)
        }}
        data-testid="map-hidden-by-filters-clear"
        className="flex-shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Show it
      </button>
    </div>
  )

  /**
   * The record being shown in full, resolved from the current results.
   *
   * Null when it has been filtered away, which closes the detail rather than
   * showing a record the list no longer contains — the alternative is a panel
   * whose Back button returns to a list that never had it.
   */
  const detailItem = detailId ? (byId.get(detailId) ?? null) : null

  /**
   * Search, filters, and the state of both.
   *
   * One definition, two homes. On a wide screen it is the HEAD of the results
   * rail, so search, filters and results are one surface — before this the map
   * carried three floating things and none of them was the primary one, which
   * is why the screen read as "a map with controls on top" rather than as a
   * tool. Below `lg` it stays a card over the map, because a permanent 400px
   * rail on a 700px screen is most of the screen.
   *
   * A constant rather than a second copy: `map-search-input` has to be exactly
   * one node. The ARIA combobox contract and most of the E2E suite are written
   * against that, and two would break both.
   */
  /**
   * The search box, and where the search is anchored.
   *
   * Floats over the map at every width. It was briefly the head of the
   * results rail, which put search, filters and results in one column -- but
   * the client kept the filters there and asked for the box back over the
   * map, and they are the one looking at it every day. It also means the
   * suggestion dropdown no longer opens on top of the ordering control.
   */
  const searchBlock = (
    // No card of its own: it is one section of the floating card, whose chrome
    // lives at the call site so that search and filters never stack into two
    // separate panels. Two cards cost 34px of extra padding and gap, which was
    // enough for the control stack to swallow a click meant for the map.
    <div className="space-y-2.5">

            {/* Where the search is anchored. A sibling of the box, never a
                replacement for it — see LocationAnchor for why. */}
            {locationLabel && (
              <LocationAnchor
                label={locationLabel}
                address={locationAddress}
                onClear={handleClearLocation}
                adjusted={anchorAdjusted}
                resolving={reverseLoading}
                precision={locationPrecision}
                onReset={searchedOrigin ? handleResetAnchor : undefined}
              />
            )}

            {/* One box that understands names, specialties, cities and ZIPs.
                Replaces the two unrelated inputs the map used to have. */}
              <SmartSearchBox
                value={filterText}
                onChange={setFilterText}
                inputRef={searchInputRef}
                onOpenChange={setSearchOpen}
                listClassName={
                  // Not a dropdown any more: it starts under the field and runs
                  // to the bottom of the screen. dvh rather than vh because the
                  // mobile keyboard is about to take a third of the window and
                  // vh would not notice.
                  searchTakeover
                    ? 'sm:!max-h-[22rem] !max-h-[calc(100dvh-10rem)] !border-0 !shadow-none !rounded-xl'
                    : undefined
                }
                onSubmit={handleSearchSubmit}
                onSelect={handleSuggestionSelect}
                onRemove={handleSuggestionRemove}
                groups={suggestionGroups}
                resultCount={resultTotal}
                aria-label={
                  isClinicViewer
                    ? 'Search specialists by name, specialty, city or ZIP'
                    : 'Search providers by name, specialty, city or ZIP'
                }
                placeholder={
                  // With an anchor set the box's job has changed from "find me a
                  // place" to "narrow what is already around it", and saying so
                  // is the difference between people using it and not.
                  locationLabel
                    ? `Filter these ${resultTotal} results...`
                    : isClinicViewer
                      ? 'Search specialists, specialty, city or ZIP...'
                      : 'Search providers, specialty, city or ZIP...'
                }
              />
    </div>
  )

  /**
   * Everything that narrows the results.
   *
   * Lives with the results: in the rail head when there is a rail, and in a
   * card under the search box when there is not.
   */
  const filterBlock = (
    <div className="space-y-2.5">
            {/* Everything that narrows the results. Collapsed behind a button
                on a phone: anchor + box + five radius chips + a tag rail + two
                type chips is ~300px of glass on a 667px screen. */}
            {(!isPhone || filtersOpen) && (
              <div className="space-y-2.5">

                {/* Radius — one radiogroup, not five loose toggles. The counter
                    that used to live at the end of this row moved to the summary
                    line below: inside a 420px card it wrapped onto a second line
                    and pushed every control under it down by ~20px, so simply
                    picking a radius made the card jump. */}
                {locationLabel && (
                  <div className="flex items-center gap-1.5">
                    <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Radius
                    </span>
                    <Segmented
                      options={RADIUS_OPTIONS}
                      value={radiusMiles === null ? 'any' : String(radiusMiles)}
                      onChange={(v) => applyRadius(v === 'any' ? null : Number(v))}
                      label="Search radius"
                      data-testid="map-radius"
                    />
                  </div>
                )}

                {/* Specialties, straight from the facet counts. These were only
                    reachable before by typing two characters and hoping the tag
                    made the dropdown's top three. */}
                {visibleTags.length > 0 && (
                  <div className="space-y-1.5">
                  <div
                    className={cn(
                      'flex gap-1.5',
                      showAllTags
                        ? 'items-start'
                        : // Collapsed, the rail's right edge — and the "+N" sitting
                          // on it — ran underneath the locate/list buttons on a
                          // phone, so the control that reveals the other seventeen
                          // specialties could not be pressed at all. That is the
                          // "+17 does nothing" report: it was not doing nothing,
                          // it was under a button.
                          'items-center mr-[4.5rem] sm:mr-0'
                    )}
                  >
                    {/* The rail scrolls; the disclosure does not. Putting the
                        "+N more" button inside the scroller meant you had to
                        scroll to find the control that saves you scrolling.

                        Expanded, it WRAPS instead of scrolling. It used to keep
                        scrolling, so pressing "+17" added seventeen chips off
                        the right-hand edge of a 400px column — and once the
                        scrollbar track was hidden there was nothing left to
                        suggest they were there at all. Reported as "+17 does
                        nothing", which is exactly what it looked like. "Show
                        more" has to mean shown. */}
                    <div
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-1.5',
                        showAllTags
                          ? // Fades at the bottom edge instead of guillotining a
                            // row of chips in half, which reads as a rendering
                            // fault rather than as "keep going".
                            // 45vh, not a fixed height: the twenty-three
                            // specialties come to 359px, so a 192px box still
                            // hid three rows behind a scroll nobody asked for
                            // — a quieter version of the same complaint. Tied
                            // to the viewport it fits them all on any normal
                            // window and still cannot swallow a short one.
                            'max-h-[45vh] flex-wrap overflow-y-auto [mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent)]'
                          : cn(
                              'xc-rail flex-nowrap overflow-x-auto pb-0.5',
                              // Same idea sideways, and only when something is
                              // actually cut off: at 400px the collapsed rail
                              // sliced "Rehabilitation" mid-word against the
                              // "+17", which looks like a bug and not like a
                              // scroller. Skipped when everything fits, so the
                              // last chip is never dimmed for no reason.
                              overflowTags &&
                                '[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]'
                            )
                      )}
                    >
                    {visibleTags.map((tag) => {
                      const selected = tagFilters.includes(tag.value)
                      return (
                        <Chip
                          key={tag.value}
                          selected={selected}
                          onToggle={() =>
                            setTagFilters((current) =>
                              selected
                                ? current.filter((t) => t !== tag.value)
                                : [...current, tag.value]
                            )
                          }
                          count={tag.count}
                          disabled={tag.count === 0 && !selected}
                          aria-label={`${selected ? 'Remove' : 'Add'} ${tag.value} filter`}
                          data-testid="map-filter-chip"
                        >
                          {tag.value}
                          {selected && <X className="h-3 w-3" aria-hidden="true" />}
                        </Chip>
                      )
                    })}
                    </div>
                    {overflowTags && !showAllTags && (
                      <button
                        type="button"
                        onClick={() => setShowAllTags(true)}
                        data-testid="map-more-tags"
                        className="shrink-0 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold text-navy/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        +{facets.tags.length - MAX_VISIBLE_TAGS}
                      </button>
                    )}
                  </div>
                  {/* Open, the way back gets its own row under the chips rather
                      than floating at the top right of a block ten rows tall,
                      where it read as belonging to nothing and — on a phone —
                      sat under the list button. */}
                  {overflowTags && showAllTags && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(false)}
                      data-testid="map-more-tags"
                      className="w-full rounded-lg border border-gray-200/50 py-1.5 text-[11px] font-semibold text-navy/70 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      Show fewer specialties
                    </button>
                  )}
                  </div>
                )}

              </div>
            )}

            {/* The state of the search, in one line.
                Owns the counter, so no control above it can reflow when a
                number appears or changes width.

                It used to end on "Clear 1 filter" from the very first render,
                because `showAvailableOnly` starts true. So every session opened
                by telling the user they had a filter — naming a quantity rather
                than a thing, for a filter they had not set and whose own chip
                now sits at the other end of this very line.

                `Clear all` now appears only once something is genuinely stacked
                up. With one filter the chip that set it is the way to unset it,
                and a second control for the same job is what made this line
                read as a warning. */}
            <div
              className={cn(
                'flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-gray-200/50 pt-2',
                // Wraps, because this line carries the type chip, the
                // availability chip, the count and — on a phone — the Filters
                // button. On 390px they do not fit, and without wrapping the
                // count printed straight through the button on top of it.
              )}
            >
              {/* The type toggles live on this line rather than a row of their
                  own. On the clinic map exactly one of them renders, and a
                  whole row of glass for a single chip is why this card was
                  taller than what it controlled.

                  NOT removed, which is what I tried first. It looks like a
                  dead switch -- turning off the only type on the map empties
                  the screen -- but `map-search.spec.ts:347` records that a
                  real user pressed it on the live site and reported it as
                  broken when it did nothing. Someone reaching for a control
                  is the evidence that settles whether it is one. */}
              {showClinicsProp && (
                <Chip
                  selected={showClinics}
                  onToggle={() => setShowClinics(!showClinics)}
                  tone="clinic"
                  count={typeCount('clinic')}
                  icon={
                    isClinicViewer
                      ? <Stethoscope className="h-3 w-3" aria-hidden="true" />
                      : <Building2 className="h-3 w-3" aria-hidden="true" />
                  }
                >
                  {isClinicViewer ? 'Specialists' : 'Clinics'}
                </Chip>
              )}
              {showLawyersProp && (
                <Chip
                  selected={showLawyers}
                  onToggle={() => setShowLawyers(!showLawyers)}
                  tone="lawyer"
                  count={typeCount('lawyer')}
                  icon={<Scale className="h-3 w-3" aria-hidden="true" />}
                >
                  Attorneys
                </Chip>
              )}
              <Chip
                selected={showAvailableOnly}
                onToggle={() => setShowAvailableOnly(!showAvailableOnly)}
                tone="available"
                aria-label="Show only providers accepting referrals"
                data-testid="map-available-chip"
                icon={
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      showAvailableOnly ? 'bg-white' : 'bg-gray-300'
                    )}
                  />
                }
              >
                Available
              </Chip>
              {/* Scope and the way out of it — deliberately NOT a count.
                  This used to read "696 of 1240 shown", seventy-five pixels
                  above "696 of 1240 results" in the panel header: the same two
                  numbers, twice, in one column. Now that the filters live in
                  the rail head the pair sat together and the duplication was
                  impossible to miss. The panel header keeps the counts, which
                  is where the suite reads them from; this line keeps the thing
                  the header does not say, which is how far the search reaches. */}
              <p className="min-w-[5rem] flex-1 text-[11px] leading-tight text-gray-500" data-testid="map-summary">
                {radiusMiles ? `Within ${radiusMiles} mi` : 'Any distance'}
                {activeFilterCount > 1 && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      data-testid="map-clear-filters"
                      className="font-semibold text-navy/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      Clear all
                    </button>
                  </>
                )}
              </p>

              {isPhone && (
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  data-testid="map-filters-toggle"
                  className="shrink-0 rounded-lg border border-gray-200/40 bg-gray-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <SlidersHorizontal className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>
              )}
            </div>
    </div>
  )


  const panelBody = detailItem ? (
    <ProviderDetail
      item={detailItem}
      onBack={handleCloseDetail}
      onRefer={handleReferral}
      userRole={userRole}
    />
  ) : (
    <>
      {hiddenNotice}
      <VirtualPanelList
        items={panelItems}
        onFocus={handleFocusItem}
        onOpen={handleOpenDetail}
        onHover={handleHoverItem}
        onRefer={handleReferral}
        userRole={userRole}
        hoveredId={hoveredId}
        selectedId={selectedId}
        scrollTo={scrollTo}
        emptyState={emptyState}
      />
    </>
  )

  /* ── Loading state ── */
  if (loading) return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-[#f0f4f8]" role="status">
      <div className="text-center">
        <div className="relative h-12 w-12 mx-auto">
          <div className="absolute inset-0 rounded-full border-[3px] border-navy/5" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-gold animate-spin" />
        </div>
        <p className="mt-5 text-xs text-gray-400 tracking-widest uppercase font-medium">Loading map</p>
      </div>
    </div>
  )

  /* ── Error state ── */
  if (error) return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 text-center bg-[#f0f4f8]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 shadow-sm"><AlertTriangle className="h-7 w-7 text-red-400" /></div>
      <div><p className="font-semibold text-gray-900 text-lg">Connection Error</p><p className="text-sm text-gray-400 mt-1.5 max-w-xs">Unable to load map data. Please check your connection and try again.</p></div>
      <button onClick={fetchData} className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy-light transition-all shadow-lg shadow-navy/20"><RefreshCw className="h-4 w-4" /> Try Again</button>
    </div>
  )

  /* ── Main map ── */
  return (
    <div
      className="relative h-[calc(100vh-4rem)] bg-gray-100 rounded-2xl overflow-hidden shadow-md"
      style={
        // How much of the map the results sheet is currently covering, so the
        // OpenStreetMap credit can sit just above it. Leaflet puts z-index
        // 1000 on its corner containers, which is higher than the sheet, so
        // the credit has always painted OVER the sheet rather than behind it
        // -- it just used to do so at the very bottom edge where it was easy
        // to miss. A percentage, because `bottom` resolves against the
        // container height while `margin-bottom` would resolve against its
        // width.
        useSheet
          ? ({ ['--xc-sheet']: `${SNAP_FRACTION[sheetSnap] * 100}%` } as CSSProperties)
          : undefined
      }
    >
      {/* MAP */}
      {/* The map is inset on desktop so the docked results panel sits
          beside it rather than covering it. */}
      <div ref={mapShellRef} data-testid="map-shell" className={cn('absolute inset-0 transition-[right] duration-300 ease-out motion-reduce:transition-none', panelDocked && showPanel && 'lg:right-[400px]')}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
        zoomControl={false}
        ref={mapRef}
      >
        <MapEvents
          onMoveEnd={handleMapMoveEnd}
          // Bound only while armed, so an ordinary click on the map never
          // moves someone's anchor by accident.
          onPick={placingPin ? handlePickPin : undefined}
        />
        {/* Bottom-left, and not on a phone at all.

            The results sheet owns the bottom of a phone screen -- at its peek
            snap it sits over exactly where these buttons are, so the sort
            control was rendered underneath a + and a −. Pinch is how anyone
            zooms a map on a touch screen anyway; the buttons are there for a
            mouse, and a mouse comes with a scroll wheel and a wider window. */}
        {!isPhone && <ZoomControl position="bottomleft" />}
        {/* Standard OpenStreetMap tiles. A muted CARTO basemap was tried, on
            the theory that a quieter background lets the pins carry the
            colour, but the client prefers this one: the green land and blue
            water make the map read as a map at a glance. Their call. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterLayer
          ref={markersRef}
          items={visibleItems}
          userRole={userRole}
          onReferral={handleReferral}
          onMarkerHover={handleMarkerHover}
          onMarkerClick={handleMarkerClick}
        />
        {searchedLocation && radiusMiles && (
          <Circle ref={circleRef} center={searchedLocation} radius={radiusMiles * 1609.34}
            // Was weight 1.5 at 5% fill: technically present, invisible in
            // practice, so the one thing that could show what a radius means
            // showed nothing. Dashed so it reads as a boundary rather than as
            // another map feature.
            pathOptions={{
              color: '#1a2a4a',
              weight: 2,
              opacity: 0.75,
              dashArray: '6 5',
              fillColor: '#1a2a4a',
              fillOpacity: 0.06,
            }} />
        )}
        {searchedLocation && (
          <Marker
            ref={homeMarkerRef}
            position={searchedLocation}
            icon={homeIcon}
            zIndexOffset={1000}
            // Geocoders resolve to a rooftop centroid, a street segment, or
            // whatever the building was last tagged as. For "how far is this
            // clinic from my client's home" that is usually close enough and
            // occasionally out by a block, so the pin is the user's to correct.
            draggable
            autoPan
            autoPanSpeed={12}
            // Focusable, so the arrow keys below are reachable at all. Dragging
            // is pointer-only by nature; without this the feature simply does
            // not exist for a keyboard.
            keyboard
            title={locationLabel || undefined}
            alt={
              locationLabel
                ? `Search location: ${locationLabel}. Drag, or use the arrow keys, to adjust it.`
                : 'Search location. Drag, or use the arrow keys, to adjust it.'
            }
            eventHandlers={{
              dragstart: handleAnchorDragStart,
              drag: handleAnchorDrag,
              dragend: handleAnchorDragEnd,
              keydown: handleAnchorKeyDown,
            }}
          />
        )}
      </MapContainer>
      </div>

      {/* ═══ SEARCH THIS AREA ═══ */}
      {/* Bottom-centre rather than top-centre: the search card occupies the
          top-left up to 420px, and a top-centred pill lands underneath it on
          a laptop screen, visible but unclickable. The zoom control sits
          bottom-left, so the bottom centre is the one uncontested spot. */}
      {/* `placingPin` belongs in this condition, not just on the pill inside.
          It was omitted at first, and the effect was that "place the pin
          yourself" armed the map silently: the state flipped, the click handler
          bound, and the user was told nothing — because on a freshly loaded map
          neither `mapMoved` nor `viewportBounds` is true, so the whole slot was
          absent. Three E2E cases caught it; nothing in the type system could. */}
      {(mapMoved || viewportBounds || placingPin || hasPanned) && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:left-1/2 z-[502] flex items-center gap-2">
          {/* Armed by "place the pin yourself". Occupies the same slot as the
              other pills, and suppresses "Search this area" while it is up so
              two competing calls to action never stack. */}
          {placingPin && (
            <div
              role="status"
              data-testid="map-pin-placing"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-bold text-navy shadow-lg shadow-gold/30"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Click the map to set the location
              <button
                type="button"
                onClick={() => setPlacingPin(false)}
                aria-label="Cancel placing the pin"
                data-testid="map-pin-placing-cancel"
                className="ml-1 rounded-full p-0.5 hover:bg-navy/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          )}
          {/* Follow-the-map, in the same spot as the pill it replaces.

              Deliberately NOT in the filter card: it is a decision about the
              map, taken while looking at the map, and it appears at the moment
              it becomes relevant — the first time a pan raises "Search this
              area" — which is the only moment anyone would think to want it.
              A checkbox rather than a pill, because it has a state rather than
              an action, and it reports that state to a screen reader without
              needing to be told what it means. */}
          {!placingPin && hasPanned && (
            <label
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold shadow-lg backdrop-blur-xl transition-all',
                autoSearchArea
                  ? 'border-navy/20 bg-navy text-white shadow-navy/30'
                  : 'border-white/60 bg-white/[0.92] text-gray-600 shadow-black/[0.08] hover:text-navy'
              )}
            >
              <input
                type="checkbox"
                checked={autoSearchArea}
                onChange={(event) => setAutoArea(event.target.checked)}
                data-testid="map-auto-area"
                // `accent-` rather than `text-`: without the forms plugin a
                // native checkbox ignores the text colour and paints itself the
                // browser's blue, which on a navy pill is the one colour on the
                // page that belongs to no one.
                className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1"
              />
              Search as I move the map
            </label>
          )}
          {mapMoved && !placingPin && !autoSearchArea && (
            <button
              type="button"
              onClick={handleSearchThisArea}
              data-testid="map-search-this-area"
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-bold text-white shadow-lg shadow-navy/30 hover:bg-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 transition-all"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Search this area
            </button>
          )}
          {viewportBounds && !autoSearchArea && (
            <button
              type="button"
              onClick={handleClearViewport}
              aria-label="Stop limiting results to this area"
              data-testid="map-clear-viewport"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.92] backdrop-blur-xl px-3 py-2 text-[11px] font-semibold text-gray-600 border border-white/60 shadow-lg shadow-black/[0.08] hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 transition-all"
            >
              This area only
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* The controls, floating over the map.

          Only when the rail is not carrying them: below `lg`, or when a
          desktop user has collapsed the rail to get the whole map back. They
          have to live somewhere — collapsing the results should not take the
          way to start a search with it. */}
      {/* Only the SEARCH box has to dodge the locate/list buttons in the top
          right; the filters sit below them and do not. Reserving 7rem across
          the whole stack cost the filters 126 of a phone's 390 pixels, which
          was enough to force the expanded specialties to one chip per row with
          half the card empty beside them. Above 640px the card hits its
          420px cap long before the buttons, so the margin is phone-only. */}
      <div
        className={cn(
          'z-[500]',
          searchTakeover
            ? // Fixed, not absolute: the search screen belongs to the viewport,
              // not to the map pane it was floating over.
              //
              // 1100 because Leaflet stacks `.leaflet-bottom` at 1000 — not the
              // 800 its controls advertise — and neither wrapper in between
              // opens a stacking context, so the two compete at the root and
              // the OpenStreetMap attribution was painting straight through the
              // middle of the search screen. The same 1000 is why the zoom
              // control had to be dropped on a phone.
              'fixed inset-0 z-[1100]'
            : 'absolute top-4 left-4 right-4 max-w-[420px]'
        )}
        style={{ pointerEvents: 'none' }}
      >
        {/* Search is here at every width and in every state -- it is never
            conditional on the rail. Pressing the rail toggle used to take the
            box, the radius, the specialties and the ordering off the screen
            together, because all four were one block that moved between two
            homes. Collapsing the results is a request to see the map, not to
            put the controls away. */}
        <div
          className={cn(
            'space-y-2.5 border bg-white/[0.92] backdrop-blur-xl',
            searchTakeover
              ? 'h-full rounded-none border-transparent bg-white p-4 shadow-none'
              : 'rounded-2xl border-white/60 p-3 shadow-xl shadow-black/[0.08]'
          )}
          style={{ pointerEvents: 'auto' }}
        >
          {/* A way out that is not "tap the one part of the map still showing".
              A full-screen overlay covers whatever you would otherwise tap to
              dismiss it, so it has to carry its own exit. */}
          {searchTakeover && (
            <div className="flex items-center justify-between pb-1">
              <span className="text-sm font-bold text-navy">Search</span>
              <button
                type="button"
                onClick={() => {
                  // Blur first: the box closes when focus leaves it, and going
                  // through its own path keeps the active-option state in step
                  // instead of leaving a highlighted row behind a closed list.
                  searchInputRef.current?.blur()
                  setSearchOpen(false)
                }}
                data-testid="map-search-cancel"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Cancel
              </button>
            </div>
          )}
          {/* Only the search input dodges the locate/list buttons in the top
              right, and only on a phone: reserving that width for the whole
              card left the expanded specialties 211px to wrap into, which is
              one chip per row with half the card empty beside it. */}
          <div className={cn(!searchTakeover && 'mr-[4.5rem] sm:mr-0')}>{searchBlock}</div>
          {/* The filters follow the results. With a rail open they sit at the
              head of it, next to the list they narrow; with no rail they have
              nowhere else to be, so they come back here under the box —
              in the same card, not a second one below it. */}
          {!(panelDocked && showPanel) && !searchTakeover && filterBlock}
        </div>
      </div>

      {/* ═══ RIGHT BUTTONS ═══ */}
      <div
        className={cn(
          'absolute top-4 right-4 z-[500] flex flex-col gap-2',
          // Clear of the docked panel at desktop widths.
          panelDocked && showPanel && 'lg:right-[calc(400px+1rem)]'
        )}
      >
        <button onClick={handleGeolocate} disabled={locating}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.92] backdrop-blur-xl border border-white/60 shadow-xl shadow-black/[0.08] text-gray-500 hover:text-navy hover:bg-white disabled:opacity-50 transition-all"
          // A `title` is a tooltip, not a name: it is unreliable on touch, and
          // a screen reader announced this as "button" with a lone icon inside.
          aria-label="Use my location"
          title="Use my location">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
        </button>
        {/* On a phone this raises and lowers the sheet; everywhere else it
            shows and hides the results list. */}
        <div className="relative">
          {/* A search can produce results while the list is hidden. The ring
              says "something arrived", the badge says how much. */}
          {panelAttention && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-gold/50 animate-ping motion-reduce:hidden"
            />
          )}
          <button
            onClick={() => {
              if (useSheet) setSheetSnap((current) => (current === 'peek' ? 'half' : 'peek'))
              else togglePanel()
            }}
            aria-expanded={useSheet ? sheetSnap !== 'peek' : showPanel}
            aria-label={
              showPanel || (useSheet && sheetSnap !== 'peek')
                ? 'Hide results list'
                : `Show results list, ${resultTotal} ${resultTotal === 1 ? 'result' : 'results'}`
            }
            data-testid="map-panel-toggle"
            className={cn(
              'relative flex items-center justify-center h-10 w-10 rounded-xl backdrop-blur-xl border shadow-xl shadow-black/[0.08] transition-all duration-200',
              (useSheet ? sheetSnap !== 'peek' : showPanel)
                ? 'bg-navy text-white border-navy shadow-navy/30'
                : 'bg-white/[0.92] text-gray-500 border-white/60 hover:text-navy hover:bg-white',
              panelAttention && 'border-gold text-navy ring-2 ring-gold'
            )}
            title={showPanel ? 'Hide results' : 'Show results'}
          >
            <ListIcon className="h-4 w-4" />
            {!showPanel && !useSheet && resultTotal > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-navy px-1 text-[10px] font-bold leading-[18px] text-white tabular-nums shadow-sm">
                {resultTotal > 999 ? '999+' : resultTotal}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══ RESULTS PANEL ═══
          Three presentations of one list: a bottom sheet on phones, a sliding
          overlay on tablets, a docked column on desktop. The list is what makes
          results comparable, so on a wide screen it stays put rather than
          sliding away the moment it is used. */}
      {useSheet ? (
        <Sheet
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          aria-label="Search results"
          data-testid="map-results-sheet"
          handleLabel={
            <p
              className="truncate px-6 text-[11px] font-semibold text-gray-500"
              data-testid="map-results-summary"
            >
              {/* With a record open the sheet is showing one thing, so counting
                  results on its handle describes something that is no longer on
                  screen. */}
              {detailItem ? detailItem.name : resultsSummary}
            </p>
          }
        >
          {/* Sort parity with the docked panel. A control that only exists on
              desktop is a control half the users do not have.

              Gone while a record is open: there is no list to order, and
              leaving it would suggest the detail is one of several things being
              sorted. */}
          {!detailItem && (
            <div className="border-b border-gray-100/80 px-4 pb-3">
              <Segmented
                className="w-full"
                variant="track"
                options={SORT_OPTIONS}
                value={sortMode}
                onChange={setSortMode}
                label="Order results by"
                data-testid="map-sort-sheet"
              />
            </div>
          )}
          {panelBody}
        </Sheet>
      ) : (
        <>
          {showPanel && (
            <div
              className="absolute inset-0 z-[600] bg-black/20 backdrop-blur-[2px] lg:hidden"
              onClick={() => setShowPanel(false)}
            />
          )}
          <div
            role="region"
            aria-label="Search results"
            className={cn(
              'absolute top-0 right-0 bottom-0 z-[601] w-full sm:w-[400px] bg-white/[0.97] backdrop-blur-xl shadow-2xl border-l border-gray-200/50 flex flex-col transition-transform duration-300 ease-out',
              showPanel ? 'translate-x-0' : 'translate-x-full',
              // Docked rather than floating: no shadow, and the map is inset
              // to make room. Still hideable — the toggle stays available.
              'lg:shadow-none'
            )}
            style={{ willChange: 'transform' }}
          >
            {/* The rail head: what narrows the list, directly above the list
                it narrows. The search box is NOT here — it stayed over the map,
                where the client wanted it, and where its dropdown does not open
                on top of the ordering control. */}
            {panelDocked && showPanel && (
              <div className="border-b border-gray-100/80 px-4 pb-3 pt-4">{filterBlock}</div>
            )}
            {/* Panel header.

                Hidden while a record is open: the heading names an ordering,
                the summary counts results, and Copy copies the list. None of
                the three has anything to say about one clinic, and leaving
                them would make the detail read as a filter applied to the list
                rather than a different view of one row. */}
            {!detailItem && (
            <div className="border-b border-gray-100/80 px-5 py-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
             <div className="flex items-center justify-between">
              <div className="min-w-0">
                {/* Derived from the ordering rather than written down beside
                    it. The heading was a hardcoded "Nearest Results" that went
                    on claiming distance order while the engine was sorting by
                    relevance — which it did the moment anyone typed. */}
                <h2 className="font-heading text-sm font-bold text-navy tracking-tight" data-testid="map-panel-heading">
                  {SORT_HEADINGS[effectiveSort]}
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium truncate" data-testid="map-results-summary">{resultsSummary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={handleCopyList} disabled={panelItems.length === 0}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-all duration-200 disabled:opacity-40 ${copied ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-50 text-gray-600 border-gray-200/60 hover:bg-gray-100'}`}
                  title="Copy the nearby clinics list">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={togglePanel}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold transition-colors"
                  aria-label="Hide results list"
                  data-testid="map-panel-close"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
             </div>

             {/* Ordering belongs to the list, so it lives with the list. Four
                 modes have been implemented in the engine and serialisable in
                 the URL since the search rebuild; none of them were reachable. */}
             <Segmented
               className="mt-3 w-full"
               variant="track"
               options={SORT_OPTIONS}
               value={sortMode}
               onChange={setSortMode}
               label="Order results by"
               data-testid="map-sort"
             />
            </div>
            )}
            {panelBody}
          </div>
        </>
      )}

      {/* ═══ REFERRAL MODALS ═══ */}
      {showModal && selectedClinic && <ReferralFormModal clinic={selectedClinic} onClose={handleCloseModal} />}
      {showClinicModal && selectedLawyer && <ClinicReferralFormModal lawyer={selectedLawyer} onClose={handleCloseClinicModal} />}
      {showSpecialistModal && selectedTargetClinic && (
        <MedicalSpecialistReferralModal
          targetClinic={selectedTargetClinic}
          onClose={handleCloseSpecialistModal}
        />
      )}
    </div>
  )
}
