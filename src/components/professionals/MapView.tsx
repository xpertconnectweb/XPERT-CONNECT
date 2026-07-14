'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useState, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import { MapContainer, TileLayer, ZoomControl, Circle, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, RefreshCw, Search, X, MapPin,
  Locate, Loader2, List as ListIcon, ChevronRight, Building2, Scale, Stethoscope,
  Copy, Check,
} from 'lucide-react'
import { ReferralFormModal } from './ReferralFormModal'
import { ClinicReferralFormModal } from './ClinicReferralFormModal'
import { MedicalSpecialistReferralModal } from './MedicalSpecialistReferralModal'
import { MarkerClusterLayer } from './map/MarkerClusterLayer'
import { VirtualPanelList } from './map/VirtualPanelList'
import { clinicAvailIcon, homeIcon } from '@/lib/map/icons'
import { US_DEFAULT_CENTER, US_DEFAULT_ZOOM, STATE_MAP_CONFIG, haversineDistance } from '@/lib/map/geo'
import type { MapItem, GeocodeSuggestion } from '@/lib/map/types'
import type { Clinic } from '@/types/professionals'
import type { Lawyer } from '@/types/professionals'

L.Marker.prototype.options.icon = clinicAvailIcon

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id) }, [value, delay])
  return debounced
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
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
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
  const [showClinics, setShowClinics] = useState(showClinicsProp)
  const [showLawyers, setShowLawyers] = useState(showLawyersProp)
  const [locationQuery, setLocationQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const debouncedLocation = useDebounce(locationQuery, 400)
  const [locating, setLocating] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
  // Anchor point for "clinics near the client's home": the searched/geolocated coordinates.
  const [searchedLocation, setSearchedLocation] = useState<[number, number] | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [copied, setCopied] = useState(false)
  const autoSelectRef = useRef(false)
  const userState = session?.user?.state
  const stateConfig = userState ? STATE_MAP_CONFIG[userState] : undefined
  const initialCenter = stateConfig?.center ?? US_DEFAULT_CENTER
  const initialZoom = stateConfig?.zoom ?? US_DEFAULT_ZOOM
  const [mapCenter, setMapCenter] = useState<[number, number]>(initialCenter)
  const [showPanel, setShowPanel] = useState(false)

  const debouncedCenter = useDebounce(mapCenter, 500)

  const mapRef = useRef<L.Map | null>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const locationInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

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

  // Deep-link support: /professionals/map?near=<address> prefills the search and auto-selects
  // the first match, so "Find clinics near this client" from a referral lands ready to use.
  useEffect(() => {
    const near = new URLSearchParams(window.location.search).get('near')
    if (near && near.trim().length >= 3) { autoSelectRef.current = true; setLocationQuery(near.trim()) }
  }, [])

  // Keyboard navigation resets to the top suggestion whenever the list changes.
  useEffect(() => { setActiveSuggestion(0) }, [suggestions])

  // Nominatim geocoding
  useEffect(() => {
    if (!debouncedLocation || debouncedLocation.length < 3) { setSuggestions([]); return }
    let cancelled = false

    // Nominatim free-text search returns nothing when the address includes an apartment/unit
    // designator (Apt 4B, #1402, Suite 200...). Strip those so a full client address resolves.
    // Note: no bare "fl" — it collides with the "FL" state abbreviation and would strip the ZIP.
    const stripUnit = (addr: string) => addr
      .replace(/,?\s*(?:#\s*\w[\w-]*|\b(?:apt|apartment|suite|ste|unit|floor|bldg|building|rm|room)\b\.?\s*#?\s*\w[\w-]*)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*,\s*,/g, ',')
      .trim()

    // Try progressively: without unit → as typed → just the ZIP. The unit-stripped form goes
    // first because Nominatim sometimes matches a full "...Apt 200..." string to a coarse
    // city centroid instead of the exact street; stripping never hurts precision. The ZIP is
    // the last resort so we never leave the user with an empty search.
    const zipMatch = debouncedLocation.match(/\b\d{5}(?:-\d{4})?\b/)
    const candidates = Array.from(new Set([
      stripUnit(debouncedLocation),
      debouncedLocation,
      zipMatch?.[0],
    ].filter((c): c is string => !!c && c.length >= 3)))

    ;(async () => {
      setGeocoding(true)
      try {
        let data: GeocodeSuggestion[] = []
        for (const candidate of candidates) {
          const q = encodeURIComponent(candidate)
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=5&countrycodes=us`, { headers: { 'User-Agent': 'XpertConnect/1.0' } })
          if (cancelled) return
          if (!res.ok) continue
          data = await res.json()
          if (data.length > 0) break
        }
        if (!cancelled) { setSuggestions(data); setShowSuggestions(data.length > 0) }
      } catch { if (!cancelled) setSuggestions([]) }
      finally { if (!cancelled) setGeocoding(false) }
    })()
    return () => { cancelled = true }
  }, [debouncedLocation])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          locationInputRef.current && !locationInputRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectSuggestion = useCallback((s: GeocodeSuggestion) => {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon)
    setMapCenter([lat, lng]); setSearchedLocation([lat, lng]); setLocationLabel(s.display_name.split(',').slice(0, 2).join(','))
    setLocationQuery(''); setSuggestions([]); setShowSuggestions(false)
    mapRef.current?.setView([lat, lng], 12)
  }, [])

  // Auto-select the first match when the search was driven by the ?near= deep link.
  useEffect(() => {
    if (autoSelectRef.current && suggestions.length > 0) {
      autoSelectRef.current = false
      handleSelectSuggestion(suggestions[0])
    }
  }, [suggestions, handleSelectSuggestion])

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
    setMapCenter(initialCenter); mapRef.current?.setView(initialCenter, initialZoom)
  }, [initialCenter, initialZoom])

  // Keyboard navigation for the location suggestions dropdown.
  const handleLocationKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); handleSelectSuggestion(suggestions[activeSuggestion] ?? suggestions[0]) }
    else if (e.key === 'Escape') { setShowSuggestions(false) }
  }, [showSuggestions, suggestions, activeSuggestion, handleSelectSuggestion])

  const viewerClinicId = session?.user?.role === 'clinic' ? session?.user?.clinicId : undefined
  const isClinicViewer = session?.user?.role === 'clinic'

  // Build unified MapItem list
  const validItems: MapItem[] = useMemo(() => {
    const query = filterText.toLowerCase().trim()
    const items: MapItem[] = []

    if (showClinics) {
      for (const c of clinics) {
        if (!c.lat || !c.lng || (c.lat === 0 && c.lng === 0)) continue
        // Don't show the clinic to itself when browsing as a clinic user.
        if (viewerClinicId && c.id === viewerClinicId) continue
        // For clinic viewers, hide chiropractic-only clinics (consistent with
        // SpecialistsList) — they're the referrer's own specialty.
        if (isClinicViewer && c.specialties && c.specialties.length > 0 &&
            c.specialties.every((s) => /chiroprac/i.test(s))) continue
        if (showAvailableOnly && !c.available) continue
        if (query && !(
          c.name.toLowerCase().includes(query) || (c.address && c.address.toLowerCase().includes(query)) ||
          c.specialties.some((s) => s.toLowerCase().includes(query)) ||
          (c.region && c.region.toLowerCase().includes(query)) || (c.county && c.county.toLowerCase().includes(query))
        )) continue
        items.push({ ...c, distance: 0, type: 'clinic', specialties: c.specialties })
      }
    }

    if (showLawyers) {
      for (const l of lawyers) {
        if (!l.lat || !l.lng || (l.lat === 0 && l.lng === 0)) continue
        if (showAvailableOnly && !l.available) continue
        if (query && !(
          l.name.toLowerCase().includes(query) || (l.address && l.address.toLowerCase().includes(query)) ||
          (l.practiceAreas || []).some((s) => s.toLowerCase().includes(query)) ||
          (l.region && l.region.toLowerCase().includes(query)) || (l.county && l.county.toLowerCase().includes(query))
        )) continue
        items.push({
          id: l.id, name: l.name, address: l.address, lat: l.lat, lng: l.lng,
          phone: l.phone, email: l.email, website: l.website, region: l.region,
          county: l.county, available: l.available, distance: 0, type: 'lawyer',
          practiceAreas: l.practiceAreas, zipCode: l.zipCode,
        })
      }
    }

    return items
  }, [clinics, lawyers, filterText, showAvailableOnly, showClinics, showLawyers])

  // When a client location is searched, anchor distances to it ("X mi from the client's home");
  // otherwise fall back to the live map center (distances update as you pan).
  const itemsWithDistance = useMemo(() => {
    const [oLat, oLng] = searchedLocation ?? debouncedCenter
    return validItems.map(item => ({
      ...item,
      distance: haversineDistance(oLat, oLng, item.lat, item.lng),
    }))
  }, [validItems, searchedLocation, debouncedCenter])

  // Radius filter (only active with a searched location) — applies to both list and map markers.
  const visibleItems = useMemo(() =>
    searchedLocation && radiusMiles
      ? itemsWithDistance.filter(item => item.distance <= radiusMiles)
      : itemsWithDistance
  , [itemsWithDistance, searchedLocation, radiusMiles])

  const panelItems = useMemo(() =>
    [...visibleItems].sort((a, b) => a.distance - b.distance)
  , [visibleItems])

  const handleCopyList = useCallback(async () => {
    if (panelItems.length === 0) return
    const origin = locationLabel || 'the selected location'
    const header = `Clinics near ${origin}${radiusMiles ? ` (within ${radiusMiles} mi)` : ''}:`
    const lines = panelItems.map((it, i) => {
      const parts = [`${i + 1}. ${it.name} — ${it.distance.toFixed(1)} mi`]
      if (it.phone) parts.push(it.phone)
      if (it.address) parts.push(it.address)
      return parts.join(' — ')
    })
    try {
      await navigator.clipboard.writeText([header, '', ...lines].join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }, [panelItems, locationLabel, radiusMiles])

  const { clinicCount, lawyerCount } = useMemo(() => {
    let clinics = 0, lawyers = 0
    for (const item of validItems) {
      if (item.type === 'clinic') clinics++; else lawyers++
    }
    return { clinicCount: clinics, lawyerCount: lawyers }
  }, [validItems])

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
  const handleClearFilter = useCallback(() => { setFilterText(''); filterInputRef.current?.focus() }, [])
  const handleMapMoveEnd = useCallback(() => { if (mapRef.current) { const c = mapRef.current.getCenter(); setMapCenter([c.lat, c.lng]) } }, [])
  const handleFocusItem = useCallback((item: MapItem) => { mapRef.current?.setView([item.lat, item.lng], 14); setShowPanel(false) }, [])

  const userRole = session?.user?.role

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
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
        zoomControl={false}
        preferCanvas={true}
        ref={mapRef}
        whenReady={() => { mapRef.current?.on('moveend', handleMapMoveEnd) }}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterLayer items={visibleItems} userRole={userRole} onReferral={handleReferral} />
        {searchedLocation && radiusMiles && (
          <Circle center={searchedLocation} radius={radiusMiles * 1609.34}
            pathOptions={{ color: '#1a2a4a', weight: 1.5, opacity: 0.5, fillColor: '#1a2a4a', fillOpacity: 0.05 }} />
        )}
        {searchedLocation && <Marker position={searchedLocation} icon={homeIcon} interactive={false} zIndexOffset={1000} />}
      </MapContainer>

      {/* ═══ CONTROLS PANEL (top-left) ═══ */}
      <div className="absolute top-4 left-4 z-[500] w-[calc(100%-7rem)] max-w-[420px]" style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col gap-2.5" style={{ pointerEvents: 'auto' }}>

          {/* Glass card container */}
          <div className="rounded-2xl bg-white/[0.92] backdrop-blur-xl shadow-xl shadow-black/[0.08] border border-white/60 p-3 space-y-2.5">

            {/* Location search */}
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              {locationLabel ? (
                <div className="flex items-center w-full rounded-xl bg-gray-50/80 py-2.5 pl-10 pr-9 text-sm text-navy border border-gray-200/40">
                  <span className="truncate font-semibold">{locationLabel}</span>
                  <button onClick={handleClearLocation} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 transition-colors" aria-label="Clear location"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <>
                  <input ref={locationInputRef} type="text" value={locationQuery}
                    onChange={(e) => { setLocationQuery(e.target.value); if (e.target.value.length >= 3) setShowSuggestions(true) }}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                    onKeyDown={handleLocationKeyDown}
                    placeholder="Search address, city, or ZIP..."
                    aria-label="Search a client address, city, or ZIP"
                    className="w-full rounded-xl bg-gray-50/80 py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/15 focus:bg-white border border-gray-200/40 transition-all" />
                  {geocoding && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
                  {showSuggestions && suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-[501] top-full left-0 right-0 mt-2 rounded-xl bg-white shadow-2xl shadow-black/[0.12] border border-gray-200/60 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => handleSelectSuggestion(s)} onMouseEnter={() => setActiveSuggestion(i)}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-gray-100/50 last:border-0 flex items-center gap-2 ${i === activeSuggestion ? 'bg-navy/[0.06]' : 'hover:bg-gray-50/80'}`}>
                          <MapPin className={`h-3.5 w-3.5 shrink-0 ${i === activeSuggestion ? 'text-navy' : 'text-gray-300'}`} />
                          <span className={`font-medium ${i === activeSuggestion ? 'text-navy' : 'text-gray-700'}`}>{s.display_name.split(',').slice(0, 3).join(',')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Radius filter — only shown once a client location is set */}
            {locationLabel && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-0.5">Radius</span>
                {([null, 5, 10, 25, 50] as const).map((r) => (
                  <button key={r ?? 'any'} onClick={() => setRadiusMiles(r)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition-all duration-200 ${radiusMiles === r ? 'bg-navy text-white border-navy shadow-sm' : 'bg-gray-50/80 text-gray-500 border-gray-200/40 hover:bg-gray-100/80'}`}>
                    {r === null ? 'Any' : `${r} mi`}
                  </button>
                ))}
                {radiusMiles && (
                  <span className="ml-auto text-[11px] font-semibold text-navy tabular-nums">{panelItems.length} within {radiusMiles} mi</span>
                )}
              </div>
            )}

            {/* Filter row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 z-10" />
                <input ref={filterInputRef} type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter by name, specialty..."
                  className="w-full rounded-lg bg-gray-50/80 py-2 pl-9 pr-7 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/15 focus:bg-white border border-gray-200/40 transition-all" />
                {filterText && (
                  <button onClick={handleClearFilter} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 transition-colors" aria-label="Clear filter"><X className="h-3 w-3" /></button>
                )}
              </div>
              <button
                onClick={() => setShowAvailableOnly(!showAvailableOnly)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold border transition-all duration-200 whitespace-nowrap ${showAvailableOnly ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/25' : 'bg-gray-50/80 text-gray-500 border-gray-200/40 hover:bg-gray-100/80'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full transition-colors ${showAvailableOnly ? 'bg-white' : 'bg-gray-300'}`} />
                Available
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200/50" />

            {/* Type toggles + counts */}
            <div className="flex items-center gap-2">
              {showClinicsProp && <button
                onClick={() => setShowClinics(!showClinics)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-all duration-200 ${showClinics ? (isClinicViewer ? 'bg-teal-500 text-white border-teal-500 shadow-md shadow-teal-500/25' : 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/25') : 'bg-gray-50/80 text-gray-400 border-gray-200/40 hover:bg-gray-100/80 hover:text-gray-500'}`}
              >
                {isClinicViewer ? <Stethoscope className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {isClinicViewer ? 'Specialists' : 'Clinics'}
                <span className={`ml-0.5 text-[10px] ${showClinics ? (isClinicViewer ? 'text-teal-100' : 'text-sky-100') : 'text-gray-300'}`}>{clinicCount}</span>
              </button>}
              {showLawyersProp && <button
                onClick={() => setShowLawyers(!showLawyers)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-all duration-200 ${showLawyers ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/25' : 'bg-gray-50/80 text-gray-400 border-gray-200/40 hover:bg-gray-100/80 hover:text-gray-500'}`}
              >
                <Scale className="h-3 w-3" />
                Attorneys
                <span className={`ml-0.5 text-[10px] ${showLawyers ? 'text-red-100' : 'text-gray-300'}`}>{lawyerCount}</span>
              </button>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT BUTTONS ═══ */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
        <button onClick={handleGeolocate} disabled={locating}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.92] backdrop-blur-xl border border-white/60 shadow-xl shadow-black/[0.08] text-gray-500 hover:text-navy hover:bg-white disabled:opacity-50 transition-all"
          title="Use my location">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
        </button>
        <button onClick={() => setShowPanel(!showPanel)}
          className={`flex items-center justify-center h-10 w-10 rounded-xl backdrop-blur-xl border shadow-xl shadow-black/[0.08] transition-all duration-200 ${showPanel ? 'bg-navy text-white border-navy shadow-navy/30' : 'bg-white/[0.92] text-gray-500 border-white/60 hover:text-navy hover:bg-white'}`}
          title="List view">
          <ListIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ═══ SIDE PANEL ═══ */}
      {showPanel && <div className="absolute inset-0 z-[600] bg-black/20 backdrop-blur-[2px] lg:hidden" onClick={() => setShowPanel(false)} />}
      <div className={`absolute top-0 right-0 bottom-0 z-[601] w-full sm:w-[400px] bg-white/[0.97] backdrop-blur-xl shadow-2xl border-l border-gray-200/50 flex flex-col transition-transform duration-300 ease-out ${showPanel ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ willChange: 'transform' }}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/80" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div>
            <h2 className="font-heading text-sm font-bold text-navy tracking-tight">Nearest Results</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
              {panelItems.length} results found{searchedLocation && locationLabel ? ` near ${locationLabel}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleCopyList} disabled={panelItems.length === 0}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-all duration-200 disabled:opacity-40 ${copied ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-50 text-gray-600 border-gray-200/60 hover:bg-gray-100'}`}
              title="Copy the nearby clinics list">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setShowPanel(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Close panel">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Panel list (virtualized) */}
        <VirtualPanelList items={panelItems} onFocus={handleFocusItem} />
      </div>

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
