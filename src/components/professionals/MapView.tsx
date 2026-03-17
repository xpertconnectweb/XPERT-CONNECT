'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, RefreshCw, Search, X, MapPin,
  Locate, Loader2, List, ChevronRight,
} from 'lucide-react'
import { ReferralFormModal } from './ReferralFormModal'
import type { Clinic } from '@/types/professionals'

/* ── Marker icons ── */
const availableIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})

const unavailableIcon = L.divIcon({
  html: `<img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" style="width:25px;height:41px;filter:grayscale(1);opacity:.45" />`,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], className: '',
})

L.Marker.prototype.options.icon = availableIcon

const US_DEFAULT_CENTER: [number, number] = [39.8, -89.5]
const US_DEFAULT_ZOOM = 5

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface GeocodeSuggestion { display_name: string; lat: string; lon: string }

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id) }, [value, delay])
  return debounced
}

interface ClinicWithDistance extends Clinic { distance: number }

export function MapView() {
  const { data: session } = useSession()
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [showModal, setShowModal] = useState(false)

  const [filterText, setFilterText] = useState('')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [locationQuery, setLocationQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const debouncedLocation = useDebounce(locationQuery, 400)
  const [locating, setLocating] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
  const [mapCenter, setMapCenter] = useState<[number, number]>(US_DEFAULT_CENTER)
  const [showPanel, setShowPanel] = useState(false)

  const mapRef = useRef<L.Map | null>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const locationInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const fetchClinics = useCallback(async () => {
    setLoading(true); setError(false)
    try { const res = await fetch('/api/professionals/clinics'); if (!res.ok) throw new Error(); setClinics(await res.json()) }
    catch { setError(true) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchClinics() }, [fetchClinics])

  // Nominatim geocoding
  useEffect(() => {
    if (!debouncedLocation || debouncedLocation.length < 3) { setSuggestions([]); return }
    let cancelled = false
    ;(async () => {
      setGeocoding(true)
      try {
        const q = encodeURIComponent(debouncedLocation + ', US')
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=5&countrycodes=us`, { headers: { 'User-Agent': 'XpertConnect/1.0' } })
        if (!res.ok) throw new Error()
        const data: GeocodeSuggestion[] = await res.json()
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
    setMapCenter([lat, lng]); setLocationLabel(s.display_name.split(',').slice(0, 2).join(','))
    setLocationQuery(''); setSuggestions([]); setShowSuggestions(false)
    mapRef.current?.setView([lat, lng], 11)
  }, [])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { const { latitude, longitude } = pos.coords; setMapCenter([latitude, longitude]); setLocationLabel('My Location'); setLocating(false); mapRef.current?.setView([latitude, longitude], 11) },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }, [])

  const handleClearLocation = useCallback(() => {
    setLocationLabel(''); setLocationQuery(''); setMapCenter(US_DEFAULT_CENTER); mapRef.current?.setView(US_DEFAULT_CENTER, US_DEFAULT_ZOOM)
  }, [])

  const filteredClinics: ClinicWithDistance[] = useMemo(() => {
    const query = filterText.toLowerCase().trim()
    let result = clinics.filter((c) => c.lat !== 0 && c.lng !== 0)
      .map((c) => ({ ...c, distance: haversineDistance(mapCenter[0], mapCenter[1], c.lat, c.lng) }))
    if (showAvailableOnly) result = result.filter((c) => c.available)
    if (query) result = result.filter((c) =>
      c.name.toLowerCase().includes(query) || c.address.toLowerCase().includes(query) ||
      c.specialties.some((s) => s.toLowerCase().includes(query)) ||
      (c.region && c.region.toLowerCase().includes(query)) || (c.county && c.county.toLowerCase().includes(query))
    )
    result.sort((a, b) => a.distance - b.distance)
    return result
  }, [clinics, filterText, showAvailableOnly, mapCenter])

  const handleReferral = useCallback((clinic: Clinic) => { mapRef.current?.closePopup(); setSelectedClinic(clinic); setShowModal(true) }, [])
  const handleCloseModal = useCallback(() => { setShowModal(false); setSelectedClinic(null) }, [])
  const handleClearFilter = useCallback(() => { setFilterText(''); filterInputRef.current?.focus() }, [])
  const handleMapMoveEnd = useCallback(() => { if (mapRef.current) { const c = mapRef.current.getCenter(); setMapCenter([c.lat, c.lng]) } }, [])
  const handleFocusClinic = useCallback((clinic: ClinicWithDistance) => { mapRef.current?.setView([clinic.lat, clinic.lng], 14); setShowPanel(false) }, [])

  const isLawyer = session?.user?.role === 'lawyer'

  if (loading) return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-[#f8f9fb]" role="status">
      <div className="text-center">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
        <p className="mt-4 text-xs text-gray-400 tracking-wide">Loading clinics...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 text-center bg-[#f8f9fb]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50"><AlertTriangle className="h-6 w-6 text-red-400" /></div>
      <div><p className="font-semibold text-gray-900">Failed to load clinics</p><p className="text-sm text-gray-400 mt-1">Please check your connection and try again.</p></div>
      <button onClick={fetchClinics} className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-light transition-colors"><RefreshCw className="h-4 w-4" /> Retry</button>
    </div>
  )

  return (
    <div className="relative h-[calc(100vh-4rem)] bg-gray-100 rounded-xl overflow-hidden shadow-sm">
      {/* ═══ MAP ═══ */}
      <MapContainer
        center={mapCenter}
        zoom={US_DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom={true}
        zoomControl={false}
        ref={mapRef}
        whenReady={() => { mapRef.current?.on('moveend', handleMapMoveEnd) }}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredClinics.map((clinic) => (
          <Marker key={clinic.id} position={[clinic.lat, clinic.lng]} icon={clinic.available ? availableIcon : unavailableIcon}>
            <Popup>
              <div className="min-w-[240px] max-w-[300px]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-[#1a2a4a] text-[15px] leading-tight">{clinic.name}</h3>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: clinic.available ? '#ecfdf5' : '#f3f4f6', color: clinic.available ? '#15803d' : '#9ca3af' }}>
                    {clinic.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 2px' }}>{clinic.address}</p>
                <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 2px' }}>{clinic.phone}</p>
                {clinic.website && (
                  <a href={clinic.website.startsWith('http') ? clinic.website : `https://${clinic.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#20b2aa', display: 'block', margin: '0 0 2px' }}>
                    Visit Website
                  </a>
                )}
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 8px' }}>{clinic.distance.toFixed(1)} miles away</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {clinic.specialties.map((s) => (
                    <span key={s} style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: 'rgba(26,42,74,0.08)', color: '#1a2a4a' }}>{s}</span>
                  ))}
                </div>
                {isLawyer && clinic.available && (
                  <button onClick={() => handleReferral(clinic)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: '#d4a84b', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Send Referral
                  </button>
                )}
                {isLawyer && !clinic.available && (
                  <p style={{ fontSize: 11, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Not accepting referrals</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ═══ FLOATING SEARCH (top-left) ═══ */}
      <div className="absolute top-3 left-3 z-[500] w-[calc(100%-6.5rem)] max-w-md" style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col gap-2" style={{ pointerEvents: 'auto' }}>
          {/* Location search */}
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
            {locationLabel ? (
              <div className="flex items-center w-full rounded-xl bg-white py-2.5 pl-10 pr-9 text-sm text-navy shadow-lg shadow-black/[0.08] border border-gray-200/60">
                <span className="truncate font-medium">{locationLabel}</span>
                <button onClick={handleClearLocation} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Clear location"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <>
                <input ref={locationInputRef} type="text" value={locationQuery}
                  onChange={(e) => { setLocationQuery(e.target.value); if (e.target.value.length >= 3) setShowSuggestions(true) }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                  placeholder="Search location (city, ZIP)..."
                  className="w-full rounded-xl bg-white py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/20 shadow-lg shadow-black/[0.08] border border-gray-200/60" />
                {geocoding && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
                {showSuggestions && suggestions.length > 0 && (
                  <div ref={suggestionsRef} className="absolute z-[501] top-full left-0 right-0 mt-1.5 rounded-xl bg-white shadow-xl shadow-black/[0.1] border border-gray-200/60 overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => handleSelectSuggestion(s)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50/80 transition-colors border-b border-gray-100/50 last:border-0">
                        <span className="text-gray-700">{s.display_name.split(',').slice(0, 3).join(',')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Filter + available toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 z-10" />
              <input ref={filterInputRef} type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter clinics..."
                className="w-full rounded-xl bg-white py-2 pl-9 pr-7 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/20 shadow-lg shadow-black/[0.08] border border-gray-200/60" />
              {filterText && (
                <button onClick={handleClearFilter} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Clear filter"><X className="h-3 w-3" /></button>
              )}
            </div>
            <button
              onClick={() => setShowAvailableOnly(!showAvailableOnly)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium shadow-lg shadow-black/[0.08] border transition-all duration-200 whitespace-nowrap ${showAvailableOnly ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-500 border-gray-200/60 hover:bg-gray-50'}`}
            >
              <span className={`h-2 w-2 rounded-full transition-colors ${showAvailableOnly ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              Available
            </button>
          </div>

          {/* Clinic count badge */}
          <span className="self-start inline-flex items-center rounded-full bg-navy/90 px-3 py-1 text-[11px] font-medium text-white shadow-lg shadow-black/[0.08]">
            {filteredClinics.length} clinic{filteredClinics.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ═══ FLOATING BUTTONS (top-right) ═══ */}
      <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
        <button onClick={handleGeolocate} disabled={locating}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-white border border-gray-200/60 shadow-lg shadow-black/[0.08] text-gray-500 hover:text-navy hover:bg-gray-50 disabled:opacity-50 transition-colors"
          title="Use my location">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
        </button>
        <button onClick={() => setShowPanel(!showPanel)}
          className={`flex items-center justify-center h-10 w-10 rounded-xl border shadow-lg shadow-black/[0.08] transition-all duration-200 ${showPanel ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200/60 hover:text-navy hover:bg-gray-50'}`}
          title="Clinic list">
          <List className="h-4 w-4" />
        </button>
      </div>

      {/* ═══ CLINIC PANEL ═══ */}
      {showPanel && <div className="absolute inset-0 z-[498] bg-black/20 lg:hidden" onClick={() => setShowPanel(false)} />}
      <div className={`absolute top-0 right-0 bottom-0 z-[499] w-80 sm:w-96 bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-transform duration-300 ease-out ${showPanel ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ willChange: 'transform' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/80">
          <div>
            <h2 className="font-heading text-sm font-bold text-navy">Nearest Clinics</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{filteredClinics.length} results</p>
          </div>
          <button onClick={() => setShowPanel(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Close panel">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredClinics.length === 0 ? (
            <div className="p-10 text-center">
              <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <MapPin className="h-5 w-5 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-400">No clinics found</p>
              <p className="text-xs text-gray-300 mt-1">Try adjusting your filters</p>
            </div>
          ) : filteredClinics.map((clinic) => (
            <button key={clinic.id} onClick={() => handleFocusClinic(clinic)}
              className="group w-full text-left px-5 py-3.5 border-b border-gray-100/60 hover:bg-gray-50/80 transition-all duration-150 focus:outline-none focus:bg-gray-50/80">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-sm text-gray-900 leading-tight group-hover:text-navy transition-colors">{clinic.name}</h3>
                <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0 tabular-nums">{clinic.distance.toFixed(1)} mi</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{clinic.address}</p>
              {clinic.county && <p className="text-[10px] text-gray-400 mt-0.5">{clinic.county}</p>}
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${clinic.available ? 'text-emerald-600' : 'text-gray-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${clinic.available ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {clinic.available ? 'Available' : 'Unavailable'}
                </span>
                <span className="text-gray-200 text-[10px]">|</span>
                <span className="text-[11px] text-gray-400 truncate">{clinic.specialties.slice(0, 2).join(', ')}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ REFERRAL MODAL ═══ */}
      {showModal && selectedClinic && <ReferralFormModal clinic={selectedClinic} onClose={handleCloseModal} />}
    </div>
  )
}
