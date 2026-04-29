'use client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { List as VirtualList } from 'react-window'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, RefreshCw, Search, X, MapPin,
  Locate, Loader2, List as ListIcon, ChevronRight, Building2, Scale,
} from 'lucide-react'
import { ReferralFormModal } from './ReferralFormModal'
import type { Clinic } from '@/types/professionals'
import type { Lawyer } from '@/types/professionals'

/* ── Custom SVG marker icons ── */
function createSvgIcon(color: string, borderColor: string, symbol: string, opacity = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="32" height="42">
    <defs>
      <filter id="s${color.replace('#','')}" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/>
      </filter>
    </defs>
    <g filter="url(#s${color.replace('#','')})">
      <path d="M18 2C10.27 2 4 8.27 4 16c0 10 14 26 14 26s14-16 14-26c0-7.73-6.27-14-14-14z" fill="${color}" stroke="${borderColor}" stroke-width="1.5" opacity="${opacity}"/>
      <circle cx="18" cy="16" r="7" fill="white" opacity="${opacity > 0.6 ? 0.95 : 0.5}"/>
      <text x="18" y="20" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="${color}" opacity="${opacity > 0.6 ? 1 : 0.6}">${symbol}</text>
    </g>
  </svg>`
  return L.divIcon({
    html: svg,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
    className: '',
  })
}

const clinicAvailIcon = createSvgIcon('#0284c7', '#0369a1', '+')
const clinicUnavailIcon = createSvgIcon('#94a3b8', '#64748b', '+', 0.5)
const lawyerAvailIcon = createSvgIcon('#dc2626', '#b91c1c', '\u00A7')
const lawyerUnavailIcon = createSvgIcon('#94a3b8', '#64748b', '\u00A7', 0.5)

L.Marker.prototype.options.icon = clinicAvailIcon

const US_DEFAULT_CENTER: [number, number] = [39.8, -89.5]
const US_DEFAULT_ZOOM = 5

const STATE_MAP_CONFIG: Record<string, { center: [number, number]; zoom: number }> = {
  FL: { center: [27.8, -83.5], zoom: 7 },
  MN: { center: [46.0, -94.5], zoom: 7 },
}

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

type MapItemType = 'clinic' | 'lawyer'

interface MapItem {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  phone?: string
  email: string
  website?: string
  region?: string
  county?: string
  available: boolean
  distance: number
  type: MapItemType
  specialties?: string[]
  practiceAreas?: string[]
  zipCode?: string
}

/* ── Custom cluster icon factory ── */
function createClusterIcon(cluster: L.MarkerCluster) {
  const markers = cluster.getAllChildMarkers()
  const count = markers.length
  let hasClinic = false, hasLawyer = false
  for (const m of markers) {
    const t = (m.options as { itemType?: string }).itemType
    if (t === 'lawyer') hasLawyer = true; else hasClinic = true
    if (hasClinic && hasLawyer) break
  }
  const bg = hasClinic && hasLawyer ? '#1a2a4a' : hasLawyer ? '#dc2626' : '#0284c7'
  const size = count < 20 ? 36 : count < 100 ? 44 : 54
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bg};color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${size < 40 ? 12 : 14}px;font-family:system-ui,sans-serif;
      box-shadow:0 3px 12px rgba(0,0,0,0.3),0 0 0 3px rgba(255,255,255,0.5);
    ">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size),
  })
}

/* ── MarkerClusterGroup wrapper for react-leaflet v4 ── */
function MarkerClusterGroup({
  items,
  isLawyer,
  onReferral,
}: {
  items: MapItem[]
  isLawyer: boolean
  onReferral: (c: Clinic) => void
}) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
    }
    const group = (L as unknown as { markerClusterGroup: (opts: object) => L.MarkerClusterGroup }).markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      showCoverageOnHover: false,
      iconCreateFunction: createClusterIcon,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      animate: true,
    })

    const newMarkers = new Map<string, L.Marker>()
    const leafletMarkers: L.Marker[] = []

    for (const item of items) {
      const icon = item.type === 'lawyer'
        ? (item.available ? lawyerAvailIcon : lawyerUnavailIcon)
        : (item.available ? clinicAvailIcon : clinicUnavailIcon)

      const marker = L.marker([item.lat, item.lng], {
        icon,
        itemType: item.type,
      } as L.MarkerOptions & { itemType: string })

      // Build popup content lazily
      marker.bindPopup(() => buildPopupContent(item, isLawyer, onReferral), {
        minWidth: 260,
        maxWidth: 310,
        className: 'premium-popup',
      })

      newMarkers.set(item.id, marker)
      leafletMarkers.push(marker)
    }

    group.addLayers(leafletMarkers)
    map.addLayer(group)
    clusterRef.current = group
    markersRef.current = newMarkers

    return () => {
      map.removeLayer(group)
    }
  }, [map, items, isLawyer, onReferral])

  return null
}

/* ── Build popup HTML string ── */
function buildPopupContent(
  item: MapItem,
  isLawyer: boolean,
  onReferral: (c: Clinic) => void,
): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'min-width:260px;max-width:310px;font-family:system-ui,-apple-system,sans-serif;'

  const tags = item.type === 'clinic' ? item.specialties : item.practiceAreas
  const tagBg = item.type === 'clinic' ? '#eff6ff' : '#fef2f2'
  const tagColor = item.type === 'clinic' ? '#1e40af' : '#991b1b'
  const typeBg = item.type === 'clinic' ? '#e0f2fe' : '#fee2e2'
  const typeColor = item.type === 'clinic' ? '#0369a1' : '#dc2626'
  const iconBg = item.type === 'clinic' ? 'linear-gradient(135deg,#0284c7,#0ea5e9)' : 'linear-gradient(135deg,#dc2626,#ef4444)'
  const symbol = item.type === 'clinic' ? '+' : '\u00A7'
  const typeLabel = item.type === 'clinic' ? 'Clinic' : 'Attorney'

  let html = `
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
      <div style="flex-shrink:0;width:36px;height:36px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700">${symbol}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.3">${escapeHtml(item.name)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:1px 7px;border-radius:4px;background:${typeBg};color:${typeColor}">${typeLabel}</span>
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;color:${item.available ? '#059669' : '#9ca3af'}">
            <span style="width:6px;height:6px;border-radius:50%;background:${item.available ? '#10b981' : '#d1d5db'};${item.available ? 'box-shadow:0 0 0 2px rgba(16,185,129,0.2)' : ''}"></span>
            ${item.available ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>
    </div>
    <div style="height:1px;background:#f1f5f9;margin:0 0 10px"></div>
    <div style="font-size:12px;color:#475569;line-height:1.5">`

  if (item.address) {
    html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
        <span style="color:#94a3b8;flex-shrink:0;margin-top:1px;font-size:13px">&#9906;</span>
        <span>${escapeHtml(item.address)}</span>
      </div>`
  }

  if (item.phone) {
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="color:#94a3b8;flex-shrink:0;font-size:13px">&#9742;</span>
      <span>${escapeHtml(item.phone)}</span>
    </div>`
  }
  if (item.website) {
    const href = item.website.startsWith('http') ? item.website : `https://${item.website}`
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="color:#94a3b8;flex-shrink:0;font-size:13px">&#9741;</span>
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:none;font-weight:500">Visit Website</a>
    </div>`
  }

  html += `</div>
    <div style="font-size:11px;color:#94a3b8;margin:8px 0;font-weight:500">${item.distance.toFixed(1)} miles away</div>`

  if (tags && tags.length > 0) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">`
    for (const t of tags) {
      html += `<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;background:${tagBg};color:${tagColor}">${escapeHtml(t)}</span>`
    }
    html += `</div>`
  }

  container.innerHTML = html

  if (isLawyer && item.type === 'clinic' && item.available) {
    const btn = document.createElement('button')
    btn.textContent = 'Send Referral'
    btn.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(135deg,#d4a84b,#c4982f);color:#fff;font-weight:700;font-size:13px;letter-spacing:0.01em;box-shadow:0 2px 8px rgba(212,168,75,0.35);'
    btn.addEventListener('click', () => onReferral(item as unknown as Clinic))
    container.appendChild(btn)
  } else if (isLawyer && item.type === 'clinic' && !item.available) {
    const p = document.createElement('p')
    p.textContent = 'Not accepting referrals'
    p.style.cssText = 'font-size:11px;text-align:center;color:#9ca3af;font-style:italic;margin:0;'
    container.appendChild(p)
  }

  return container
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}


/* ── Panel row ── */
const PanelRow = memo(function PanelRow({
  item,
  onFocus,
}: {
  item: MapItem
  onFocus: (item: MapItem) => void
}) {
  const isClinic = item.type === 'clinic'
  return (
    <button onClick={() => onFocus(item)}
      className="group w-full text-left px-5 py-4 border-b border-gray-100/80 hover:bg-gradient-to-r hover:from-gray-50/80 hover:to-transparent transition-all duration-200 focus:outline-none">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${isClinic ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'}`}>
          {isClinic ? <Building2 className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[13px] text-gray-900 leading-tight group-hover:text-navy transition-colors truncate">{item.name}</h3>
            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 tabular-nums font-medium bg-gray-50 px-2 py-0.5 rounded-md">{item.distance.toFixed(1)} mi</span>
          </div>
          {item.address && <p className="text-[11px] text-gray-500 mt-1 leading-snug truncate">{item.address}</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${item.available ? 'text-emerald-600' : 'text-gray-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${item.available ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-gray-300'}`} />
              {item.available ? 'Available' : 'Unavailable'}
            </span>
            <span className="text-gray-200">|</span>
            <span className="text-[10px] text-gray-400 truncate font-medium">
              {isClinic
                ? item.specialties?.slice(0, 2).join(' \u00B7 ')
                : item.practiceAreas?.slice(0, 2).join(' \u00B7 ')}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
})

/* ── Virtualized panel list ── */
function VirtualPanelList({ items, onFocus }: { items: MapItem[]; onFocus: (item: MapItem) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.contentRect.height)
    })
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  if (items.length === 0) {
    return (
      <div className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <MapPin className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">No results found</p>
          <p className="text-xs text-gray-300 mt-1.5">Try adjusting your search or filters</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <VirtualList<VirtualRowProps>
        style={{ height }}
        rowCount={items.length}
        rowHeight={80}
        overscanCount={5}
        rowProps={{ items, onFocus }}
        rowComponent={VirtualPanelRow}
      />
    </div>
  )
}

type VirtualRowProps = { items: MapItem[]; onFocus: (item: MapItem) => void }

function VirtualPanelRow({
  index,
  style,
  items,
  onFocus,
}: {
  index: number
  style: React.CSSProperties
  ariaAttributes: object
  items: MapItem[]
  onFocus: (item: MapItem) => void
}) {
  const item = items[index]
  return (
    <div style={style}>
      <PanelRow item={item} onFocus={onFocus} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
interface MapViewProps {
  clinicsUrl?: string
  lawyersUrl?: string
  showLawyers?: boolean
}

export function MapView({
  clinicsUrl = '/api/professionals/clinics',
  lawyersUrl = '/api/professionals/lawyers',
  showLawyers: showLawyersProp = true,
}: MapViewProps = {}) {
  const { data: session } = useSession()
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [showModal, setShowModal] = useState(false)

  const [filterText, setFilterText] = useState('')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [showClinics, setShowClinics] = useState(true)
  const [showLawyers, setShowLawyers] = useState(showLawyersProp)
  const [locationQuery, setLocationQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const debouncedLocation = useDebounce(locationQuery, 400)
  const [locating, setLocating] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
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
      const clinicsRes = await fetch(clinicsUrl)
      if (!clinicsRes.ok) throw new Error()
      setClinics(await clinicsRes.json())
      if (showLawyersProp) {
        const lawyersRes = await fetch(lawyersUrl)
        if (lawyersRes.ok) {
          setLawyers(await lawyersRes.json())
        }
      }
    } catch { setError(true) } finally { setLoading(false) }
  }, [clinicsUrl, lawyersUrl, showLawyersProp])

  useEffect(() => { fetchData() }, [fetchData])

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
    setLocationLabel(''); setLocationQuery(''); setMapCenter(initialCenter); mapRef.current?.setView(initialCenter, initialZoom)
  }, [initialCenter, initialZoom])

  // Build unified MapItem list
  const validItems: MapItem[] = useMemo(() => {
    const query = filterText.toLowerCase().trim()
    const items: MapItem[] = []

    if (showClinics) {
      for (const c of clinics) {
        if (!c.lat || !c.lng || (c.lat === 0 && c.lng === 0)) continue
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

  const itemsWithDistance = useMemo(() =>
    validItems.map(item => ({
      ...item,
      distance: haversineDistance(debouncedCenter[0], debouncedCenter[1], item.lat, item.lng),
    }))
  , [validItems, debouncedCenter])

  const panelItems = useMemo(() =>
    [...itemsWithDistance].sort((a, b) => a.distance - b.distance)
  , [itemsWithDistance])

  const { clinicCount, lawyerCount } = useMemo(() => {
    let clinics = 0, lawyers = 0
    for (const item of validItems) {
      if (item.type === 'clinic') clinics++; else lawyers++
    }
    return { clinicCount: clinics, lawyerCount: lawyers }
  }, [validItems])

  const handleReferral = useCallback((clinic: Clinic) => { mapRef.current?.closePopup(); setSelectedClinic(clinic); setShowModal(true) }, [])
  const handleCloseModal = useCallback(() => { setShowModal(false); setSelectedClinic(null) }, [])
  const handleClearFilter = useCallback(() => { setFilterText(''); filterInputRef.current?.focus() }, [])
  const handleMapMoveEnd = useCallback(() => { if (mapRef.current) { const c = mapRef.current.getCenter(); setMapCenter([c.lat, c.lng]) } }, [])
  const handleFocusItem = useCallback((item: MapItem) => { mapRef.current?.setView([item.lat, item.lng], 14); setShowPanel(false) }, [])

  const isLawyer = session?.user?.role === 'lawyer'

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
        <MarkerClusterGroup items={itemsWithDistance} isLawyer={isLawyer} onReferral={handleReferral} />
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
                    placeholder="Search location (city, ZIP)..."
                    className="w-full rounded-xl bg-gray-50/80 py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/15 focus:bg-white border border-gray-200/40 transition-all" />
                  {geocoding && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
                  {showSuggestions && suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-[501] top-full left-0 right-0 mt-2 rounded-xl bg-white shadow-2xl shadow-black/[0.12] border border-gray-200/60 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => handleSelectSuggestion(s)} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50/80 transition-colors border-b border-gray-100/50 last:border-0">
                          <span className="text-gray-700 font-medium">{s.display_name.split(',').slice(0, 3).join(',')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

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
              <button
                onClick={() => setShowClinics(!showClinics)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-all duration-200 ${showClinics ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/25' : 'bg-gray-50/80 text-gray-400 border-gray-200/40 hover:bg-gray-100/80 hover:text-gray-500'}`}
              >
                <Building2 className="h-3 w-3" />
                Clinics
                <span className={`ml-0.5 text-[10px] ${showClinics ? 'text-sky-100' : 'text-gray-300'}`}>{clinicCount}</span>
              </button>
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
            <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{panelItems.length} results found</p>
          </div>
          <button onClick={() => setShowPanel(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Close panel">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {/* Panel list (virtualized) */}
        <VirtualPanelList items={panelItems} onFocus={handleFocusItem} />
      </div>

      {/* ═══ REFERRAL MODAL ═══ */}
      {showModal && selectedClinic && <ReferralFormModal clinic={selectedClinic} onClose={handleCloseModal} />}
    </div>
  )
}
