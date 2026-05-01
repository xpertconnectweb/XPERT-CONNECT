import L from 'leaflet'

export function createSvgIcon(color: string, borderColor: string, symbol: string, opacity = 1) {
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

export const clinicAvailIcon = createSvgIcon('#0284c7', '#0369a1', '+')
export const clinicUnavailIcon = createSvgIcon('#94a3b8', '#64748b', '+', 0.5)
export const lawyerAvailIcon = createSvgIcon('#dc2626', '#b91c1c', '\u00A7')
export const lawyerUnavailIcon = createSvgIcon('#94a3b8', '#64748b', '\u00A7', 0.5)

export function createClusterIcon(cluster: L.MarkerCluster) {
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
