import L from 'leaflet'

/**
 * @param glyphColor Colour of the symbol inside the white disc. Defaults to
 *   the pin fill, but brand turquoise on white is only ~2.3:1, so the
 *   clinic pin passes a darker shade for the glyph while keeping the
 *   recognisable fill.
 */
export function createSvgIcon(
  color: string,
  borderColor: string,
  symbol: string,
  opacity = 1,
  glyphColor = color
) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="32" height="42">
    <defs>
      <filter id="s${color.replace('#','')}" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/>
      </filter>
    </defs>
    <g filter="url(#s${color.replace('#','')})">
      <path d="M18 2C10.27 2 4 8.27 4 16c0 10 14 26 14 26s14-16 14-26c0-7.73-6.27-14-14-14z" fill="${color}" stroke="${borderColor}" stroke-width="1.5" opacity="${opacity}"/>
      <circle cx="18" cy="16" r="7" fill="white" opacity="${opacity > 0.6 ? 0.95 : 0.5}"/>
      <text x="18" y="20" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="${glyphColor}" opacity="${opacity > 0.6 ? 1 : 0.6}">${symbol}</text>
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

/**
 * The searched "client home" location — navy pin, gold house glyph.
 *
 * ONE icon, never swapped. The pin is draggable, and the obvious way to show
 * that — a second "lifted" icon applied on `dragstart` — silently breaks the
 * drag: `setIcon` replaces the marker's DOM element, and Leaflet's active drag
 * handler is bound to the element that just went away, so `dragend` never
 * fires and the drop is lost. Verified against the live map.
 *
 * So the held state is CSS on the existing element (see `.xc-home-pin--dragging`
 * in globals.css), toggled imperatively. Nothing is recreated, and React is not
 * re-rendered once per drag either.
 *
 * `overflow:visible` on the SVG so the lift is not clipped by its own box.
 */
export const homeIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="36" height="46" style="overflow:visible">
    <defs><filter id="shome" x="-40%" y="-20%" width="180%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.35)"/></filter></defs>
    <g filter="url(#shome)">
      <path d="M18 2C10.27 2 4 8.27 4 16c0 10 14 26 14 26s14-16 14-26c0-7.73-6.27-14-14-14z" fill="#1a2a4a" stroke="#c9a24b" stroke-width="1.5"/>
      <path d="M18 8.5l7.5 6.4V15h-1.6v7.2h-4.6v-4.4h-2.6v4.4h-4.6V15H10.5v-.1L18 8.5z" fill="#f5c451"/>
    </g>
  </svg>`,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -42],
  // `grab` / `grabbing` is the whole affordance. Without a cursor change there
  // is nothing at all telling anyone the pin can be moved.
  className: 'xc-home-pin',
})

/**
 * Map palette.
 *
 * These were briefly turquoise and burgundy, to line the pins up with the
 * navy / gold / turquoise used elsewhere on the professional side. The client
 * preferred the original blue, so blue it is: recognising your own map at a
 * glance beats theoretical palette tidiness.
 *
 * The glyph inside the white disc is darkened one step from the pin fill.
 * Sky blue on white is about 3.9:1, which is thin for an 11px character.
 */
export const CLINIC_PIN = '#0284c7'
export const CLINIC_PIN_BORDER = '#0369a1'
const CLINIC_GLYPH = '#075985'
export const LAWYER_PIN = '#dc2626'
export const LAWYER_PIN_BORDER = '#b91c1c'
const LAWYER_GLYPH = '#991b1b'
const UNAVAILABLE_PIN = '#94a3b8'
const UNAVAILABLE_BORDER = '#64748b'

export const clinicAvailIcon = createSvgIcon(CLINIC_PIN, CLINIC_PIN_BORDER, '+', 1, CLINIC_GLYPH)
export const clinicUnavailIcon = createSvgIcon(UNAVAILABLE_PIN, UNAVAILABLE_BORDER, '+', 0.5)
export const lawyerAvailIcon = createSvgIcon(LAWYER_PIN, LAWYER_PIN_BORDER, '\u00A7', 1, LAWYER_GLYPH)
export const lawyerUnavailIcon = createSvgIcon(UNAVAILABLE_PIN, UNAVAILABLE_BORDER, '\u00A7', 0.5)

/**
 * Emphasised pin for the row the cursor is on, or the record that was picked.
 *
 * Gold is the app's "this is the thing you acted on" colour, so a selected pin
 * reads the same way a selected chip or a focus ring does. Scaled up rather
 * than merely recoloured, because on a dense map a colour change alone is easy
 * to miss \u2014 and impossible to see for anyone who cannot distinguish it.
 */
export function createHighlightIcon(
  type: 'clinic' | 'lawyer',
  state: 'hover' | 'selected'
): L.DivIcon {
  const fill = type === 'lawyer' ? LAWYER_PIN : CLINIC_PIN
  const selected = state === 'selected'
  const size = selected ? 44 : 38
  const height = Math.round(size * (46 / 36))
  const symbol = type === 'lawyer' ? '\u00A7' : '+'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="${size}" height="${height}">
    <defs>
      <filter id="hl${type}${state}" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
    </defs>
    <g filter="url(#hl${type}${state})">
      <path d="M18 2C10.27 2 4 8.27 4 16c0 10 14 26 14 26s14-16 14-26c0-7.73-6.27-14-14-14z"
            fill="${fill}" stroke="#d4a84b" stroke-width="${selected ? 3 : 2}"/>
      <circle cx="18" cy="16" r="7" fill="white"/>
      <text x="18" y="20" text-anchor="middle" font-size="11" font-weight="700"
            font-family="system-ui,sans-serif" fill="${fill}">${symbol}</text>
    </g>
  </svg>`

  return L.divIcon({
    html: svg,
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -(height - 4)],
    className: '',
  })
}

export function createClusterIcon(cluster: L.MarkerCluster) {
  const markers = cluster.getAllChildMarkers()
  const count = markers.length
  let hasClinic = false, hasLawyer = false
  for (const m of markers) {
    const t = (m.options as { itemType?: string }).itemType
    if (t === 'lawyer') hasLawyer = true; else hasClinic = true
    if (hasClinic && hasLawyer) break
  }
  const bg = hasClinic && hasLawyer ? '#1a2a4a' : hasLawyer ? LAWYER_PIN : CLINIC_PIN
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
