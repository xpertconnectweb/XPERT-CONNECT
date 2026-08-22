'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useState, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import { MapContainer, TileLayer, ZoomControl, Circle, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, RefreshCw, Search, X, MapPin,
  Locate, Loader2, List as ListIcon, ChevronRight, Building2, Scale, Stethoscope,
  Copy, Check,
} from 'lucide-react'
import { ReferralFormModal } from './ReferralFormModal'
import { ClinicReferralFormModal } from './ClinicReferralFormModal'
import { MedicalSpecialistReferralModal } from './MedicalSpecialistReferralModal'
import { MarkerClusterLayer, type MarkerRegistry } from './map/MarkerClusterLayer'
import { VirtualPanelList, type ScrollRequest } from './map/VirtualPanelList'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion } from '@/components/search/types'
import { Chip, Sheet, type SheetSnap } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useMapSearch } from '@/hooks/useMapSearch'
import { useSmartSearch } from '@/hooks/useSmartSearch'
import { useGeocoder } from '@/hooks/useGeocoder'
import { clinicAvailIcon, homeIcon } from '@/lib/map/icons'
import { US_DEFAULT_CENTER, US_DEFAULT_ZOOM, STATE_MAP_CONFIG, haversineDistance } from '@/lib/map/geo'
import type { Bounds } from '@/lib/search'
import { parseMapUrlState, toMapUrlQuery } from '@/lib/search/url-state'
import { ZOOM_FOR_KIND, type GeocodeResult } from '@/types/geocode'
import { cn } from '@/lib/utils'
import type { MapItem } from '@/lib/map/types'
import type { Clinic } from '@/types/professionals'
import type { Lawyer } from '@/types/professionals'
import type { DecoratedClinic, DecoratedLawyer } from '@/types/professionals'

L.Marker.prototype.options.icon = clinicAvailIcon

/**
 * How far the map has to move before "Search this area" is offered. Opening a
 * popup nudges the centre slightly, and a pill that appears every time you
 * click a pin is noise.
 */
const MOVED_THRESHOLD_MILES = 2

/**
 * Binds map events through react-leaflet's own hook.
 *
 * The listener used to be attached in `whenReady` via `mapRef.current?.on(...)`,
 * which is not safe: `whenReady` can fire before the ref is assigned, and the
 * optional chaining then swallows the failure silently, leaving `moveend`
 * unbound with no error anywhere. `useMapEvents` cannot get this wrong.
 */
function MapEvents({ onMoveEnd }: { onMoveEnd: (map: L.Map) => void }) {
  const map = useMapEvents({
    moveend: () => onMoveEnd(map),
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
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  // Only surfaced when attorney pins are on, which today means the
  // legal-directory map. '' = every practice area.
  const [practiceAreaFilter, setPracticeAreaFilter] = useState('')
  const [showClinics, setShowClinics] = useState(showClinicsProp)
  const [showLawyers, setShowLawyers] = useState(showLawyersProp)
  const [locationQuery, setLocationQuery] = useState('')
  // Selected specialty / practice-area chips, applied as a filter.
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [locating, setLocating] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
  // Anchor point for "clinics near the client's home": the searched/geolocated coordinates.
  const [searchedLocation, setSearchedLocation] = useState<[number, number] | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const autoSelectRef = useRef(false)
  /** Blocks URL writes until the incoming query string has been consumed. */
  const hydratedRef = useRef(false)
  const router = useRouter()
  const userState = session?.user?.state
  const stateConfig = userState ? STATE_MAP_CONFIG[userState] : undefined
  const initialCenter = stateConfig?.center ?? US_DEFAULT_CENTER
  const initialZoom = stateConfig?.zoom ?? US_DEFAULT_ZOOM
  const [mapCenter, setMapCenter] = useState<[number, number]>(initialCenter)
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
  const [viewportBounds, setViewportBounds] = useState<Bounds | null>(null)
  const [mapMoved, setMapMoved] = useState(false)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Scroll request for the results list, raised only by map interaction. */
  const [scrollTo, setScrollTo] = useState<ScrollRequest | null>(null)
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
    if (state.radius) setRadiusMiles(state.radius)
    if (state.bbox) setViewportBounds(state.bbox)
    if (state.selected) setSelectedId(state.selected)

    if (state.at) {
      // Already resolved, so skip the geocoder entirely — a shared link lands
      // instantly and does not depend on a third party still being up.
      setSearchedLocation(state.at)
      setAppliedCenter(state.at)
      setMapCenter(state.at)
      setLocationLabel(state.near ?? 'Shared location')
    } else if (state.near && state.near.length >= 3) {
      // The original contract: geocode the address text and auto-select the
      // first match, so "View clinics near this client" from a referral lands
      // on a ready-to-use map rather than an open dropdown.
      autoSelectRef.current = true
      setLocationQuery(state.near)
    }

    hydratedRef.current = true
  }, [])

  // Address lookup now goes through /api/geocode, which sets a real User-Agent,
  // caches server-side and keeps clients' home addresses off a third party.
  const { results: geocodeResults, loading: geocoding } = useGeocoder(locationQuery)

  const applyPlace = useCallback(
    (lat: number, lng: number, label: string, zoom: number) => {
      setMapCenter([lat, lng])
      setSearchedLocation([lat, lng])
      setLocationLabel(label)
      setLocationQuery('')
      mapRef.current?.setView([lat, lng], zoom)
    },
    []
  )

  const handleSelectSuggestion = useCallback((s: GeocodeResult) => {
    // A ZIP covers far more ground than a street address; landing at street
    // zoom on a ZIP search hides most of what was asked for.
    applyPlace(s.lat, s.lng, s.label.split(',').slice(0, 2).join(','), ZOOM_FOR_KIND[s.kind])
  }, [applyPlace])

  // Auto-select the first match when the search was driven by the ?near= deep link.
  // ReferrerReferralForm depends on this: "View clinics near this client" must
  // land on a ready-to-use map, not on an open dropdown.
  useEffect(() => {
    if (autoSelectRef.current && geocodeResults.length > 0) {
      autoSelectRef.current = false
      handleSelectSuggestion(geocodeResults[0])
    }
  }, [geocodeResults, handleSelectSuggestion])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { const { latitude, longitude } = pos.coords; setMapCenter([latitude, longitude]); setSearchedLocation([latitude, longitude]); setLocationLabel('My Location'); setLocating(false); mapRef.current?.setView([latitude, longitude], 12) },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }, [])

  const handleClearLocation = useCallback(() => {
    setLocationLabel(''); setLocationQuery(''); setSearchedLocation(null); setRadiusMiles(null)
    // Clearing the location resets every spatial constraint, not just the pin —
    // leaving a stale viewport behind would keep filtering results against an
    // area the user can no longer see any reason for.
    setViewportBounds(null)
    setMapMoved(false)
    setAppliedCenter(initialCenter)
    setMapCenter(initialCenter); mapRef.current?.setView(initialCenter, initialZoom)
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

  // The practice-area select feeds the same tag filter as the chips.
  const activeTags = useMemo(
    () => (practiceAreaFilter ? [...tagFilters, practiceAreaFilter] : tagFilters),
    [tagFilters, practiceAreaFilter]
  )

  const {
    items: panelItems,
    total: resultTotal,
    facets,
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
    tags: activeTags,
    anchor,
    // The radius only means anything relative to a deliberately chosen origin;
    // measuring it from wherever the map happens to sit would silently reshuffle
    // the list on every pan.
    radiusMiles: searchedLocation ? radiusMiles : null,
    bounds: viewportBounds,
    sort: filterText.trim() ? 'relevance' : 'distance',
  })

  // Markers and the panel now render the exact same array, so the chip counts
  // and the list can no longer disagree.
  const visibleItems = panelItems

  // Practice-area options come from the loaded firms rather than a prop,
  // so the dropdown can never offer an area with zero pins.
  const practiceAreaOptions = useMemo(() => {
    const areas = new Set<string>()
    for (const l of lawyers) (l.practiceAreas || []).forEach((a) => areas.add(a))
    return Array.from(areas).sort()
  }, [lawyers])

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

  const { groups: suggestionGroups, remember, forget } = useSmartSearch({
    index: searchIndex,
    facets,
    query: filterText,
    anchor: searchedLocation,
    entityHeading: isClinicViewer ? 'Specialists' : 'Providers',
    categoryHeading: showLawyersProp ? 'Practice areas' : 'Specialties',
  })

  const handleSuggestionSelect = useCallback(
    (suggestion: Suggestion) => {
      const { payload } = suggestion
      switch (payload.kind) {
        case 'place':
          remember(payload.label, { lat: payload.lat, lng: payload.lng, label: payload.label })
          setFilterText('')
          applyPlace(payload.lat, payload.lng, payload.label, ZOOM_FOR_KIND[payload.placeKind])
          return
        case 'entity': {
          // Jump to the record itself and open its popup, rather than merely
          // filtering the list down to it.
          const item = byId.get(payload.id)
          if (!item) return
          remember(item.name)
          setFilterText('')
          mapRef.current?.setView([item.lat, item.lng], 15)
          setShowPanel(false)
          return
        }
        case 'category':
          // A category is a filter, not a text query — keeping it out of the
          // box means it survives whatever is typed next.
          setFilterText('')
          setTagFilters((current) =>
            current.includes(payload.tag) ? current : [...current, payload.tag]
          )
          return
        case 'recent':
          setFilterText(payload.query)
          return
      }
    },
    [remember, applyPlace, byId]
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
    },
    [remember]
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

  const handleClearViewport = useCallback(() => {
    setViewportBounds(null)
    setMapMoved(false)
  }, [])

  /* ── Results panel visibility ── */

  const togglePanel = useCallback(() => {
    setShowPanel((current) => {
      const next = !current
      try {
        window.localStorage.setItem('xc:map-panel-open', next ? '1' : '0')
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
      stored = window.localStorage.getItem('xc:map-panel-open')
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

  const handleMapMoveEnd = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const centre = map.getCenter()
    setMapCenter([centre.lat, centre.lng])
    // Offer to re-scope rather than doing it unasked. The threshold keeps the
    // pill from flashing up on the tiny recentre that follows opening a popup.
    const [appliedLat, appliedLng] = appliedCenterRef.current
    const moved = haversineDistance(centre.lat, centre.lng, appliedLat, appliedLng)
    setMapMoved(moved > MOVED_THRESHOLD_MILES)
  }, [])

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

  const userRole = session?.user?.role

  // The sheet and the docked panel need genuinely different markup, which no
  // media query can express. Safe here because the map never renders on the
  // server, so there is no hydration mismatch to worry about.

  const resultsSummary = `${panelItems.length} ${
    panelItems.length === 1 ? 'result' : 'results'
  } found${searchedLocation && locationLabel ? ` near ${locationLabel}` : ''}`

  const panelBody = (
    <VirtualPanelList
      items={panelItems}
      onFocus={handleFocusItem}
      onHover={handleHoverItem}
      hoveredId={hoveredId}
      selectedId={selectedId}
      scrollTo={scrollTo}
    />
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
    <div className="relative h-[calc(100vh-4rem)] bg-gray-100 rounded-2xl overflow-hidden shadow-md">
      {/* MAP */}
      {/* The map is inset on desktop so the docked results panel sits
          beside it rather than covering it. */}
      <div className={cn('absolute inset-0 transition-[right] duration-300 ease-out motion-reduce:transition-none', panelDocked && showPanel && 'lg:right-[400px]')}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
        zoomControl={false}
        preferCanvas={true}
        ref={mapRef}
      >
        <MapEvents onMoveEnd={handleMapMoveEnd} />
        <ZoomControl position="bottomleft" />
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
          <Circle center={searchedLocation} radius={radiusMiles * 1609.34}
            pathOptions={{ color: '#1a2a4a', weight: 1.5, opacity: 0.5, fillColor: '#1a2a4a', fillOpacity: 0.05 }} />
        )}
        {searchedLocation && <Marker position={searchedLocation} icon={homeIcon} interactive={false} zIndexOffset={1000} />}
      </MapContainer>
      </div>

      {/* ═══ SEARCH THIS AREA ═══ */}
      {/* Bottom-centre rather than top-centre: the search card occupies the
          top-left up to 420px, and a top-centred pill lands underneath it on
          a laptop screen, visible but unclickable. The zoom control sits
          bottom-left, so the bottom centre is the one uncontested spot. */}
      {(mapMoved || viewportBounds) && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:left-1/2 z-[502] flex items-center gap-2">
          {mapMoved && (
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
          {viewportBounds && (
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

      {/* ═══ CONTROLS PANEL (top-left) ═══ */}
      <div className="absolute top-4 left-4 z-[500] w-[calc(100%-7rem)] max-w-[420px]" style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col gap-2.5" style={{ pointerEvents: 'auto' }}>

          {/* Glass card container */}
          <div className="rounded-2xl bg-white/[0.92] backdrop-blur-xl shadow-xl shadow-black/[0.08] border border-white/60 p-3 space-y-2.5">

            {/* One box that understands names, specialties, cities and ZIPs.
                Replaces the two unrelated inputs the map used to have. */}
              <SmartSearchBox
                value={filterText}
                onChange={setFilterText}
                onSubmit={handleSearchSubmit}
                onSelect={handleSuggestionSelect}
                onRemove={handleSuggestionRemove}
                groups={suggestionGroups}
                resultCount={resultTotal}
                loading={geocoding}
                chipLabel={locationLabel || null}
                onClearChip={handleClearLocation}
                placeholder={
                  isClinicViewer
                    ? 'Search specialists, specialty, city or ZIP...'
                    : 'Search providers, specialty, city or ZIP...'
                }
              />

            {/* Selected specialty / practice-area chips */}
            {tagFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {tagFilters.map((tag) => (
                  <Chip
                    key={tag}
                    selected
                    onToggle={() => setTagFilters((c) => c.filter((t) => t !== tag))}
                    aria-label={`Remove ${tag} filter`}
                    data-testid="map-filter-chip"
                  >
                    {tag}
                    <X className="h-3 w-3" aria-hidden="true" />
                  </Chip>
                ))}
              </div>
            )}


            {/* Radius filter — only shown once a client location is set */}
            {locationLabel && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-0.5">Radius</span>
                {([null, 5, 10, 25, 50] as const).map((r) => (
                  <Chip
                    key={r ?? 'any'}
                    selected={radiusMiles === r}
                    onToggle={() => setRadiusMiles(r)}
                    aria-label={r === null ? 'Any distance' : `Within ${r} miles`}
                  >
                    {r === null ? 'Any' : `${r} mi`}
                  </Chip>
                ))}
                {radiusMiles && (
                  <span className="ml-auto text-[11px] font-semibold text-navy tabular-nums">{panelItems.length} within {radiusMiles} mi</span>
                )}
              </div>
            )}

            {/* Availability toggle. The text filter it used to sit beside is
                now part of the search box above. */}
            <div className="flex gap-2">
              <Chip
                selected={showAvailableOnly}
                onToggle={() => setShowAvailableOnly(!showAvailableOnly)}
                tone="available"
                aria-label="Show only providers accepting referrals"
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
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200/50" />

            {/* Type toggles + counts */}
            <div className="flex items-center gap-2">
              {/* Toned to match the pins they control, so the legend is the
                  control rather than a separate thing to learn. */}
              {showClinicsProp && (
                <Chip
                  selected={showClinics}
                  onToggle={() => setShowClinics(!showClinics)}
                  tone="clinic"
                  count={clinicCount}
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
                  count={lawyerCount}
                  icon={<Scale className="h-3 w-3" aria-hidden="true" />}
                >
                  Attorneys
                </Chip>
              )}
              {showLawyersProp && showLawyers && practiceAreaOptions.length > 1 && (
                <select
                  value={practiceAreaFilter}
                  onChange={(e) => setPracticeAreaFilter(e.target.value)}
                  aria-label="Filter attorneys by practice area"
                  className="rounded-lg border border-gray-200/40 bg-gray-50/80 px-2 py-1.5 text-[11px] font-semibold text-gray-500 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-colors"
                >
                  <option value="">All practice areas</option>
                  {practiceAreaOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
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
            <p className="text-[11px] font-semibold text-gray-500">
              {resultsSummary}
            </p>
          }
        >
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
            className={cn(
              'absolute top-0 right-0 bottom-0 z-[601] w-full sm:w-[400px] bg-white/[0.97] backdrop-blur-xl shadow-2xl border-l border-gray-200/50 flex flex-col transition-transform duration-300 ease-out',
              showPanel ? 'translate-x-0' : 'translate-x-full',
              // Docked rather than floating: no shadow, and the map is inset
              // to make room. Still hideable — the toggle stays available.
              'lg:shadow-none'
            )}
            style={{ willChange: 'transform' }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/80" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
              <div>
                <h2 className="font-heading text-sm font-bold text-navy tracking-tight">Nearest Results</h2>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{resultsSummary}</p>
              </div>
              <div className="flex items-center gap-1.5">
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
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
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
