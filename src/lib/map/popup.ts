import type { MapItem } from './types'
import { canRefer, referLabel } from './referral-policy'

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * The popup answers one question: which pin is this?
 *
 * It used to be a second, fuller detail card — specialty chips, a website link,
 * the lot — built as hand-written HTML with inline hex colours, entirely
 * outside the Tailwind and `Chip` design system, and 310px wide over a map the
 * user was trying to read. Now that every result row carries the same detail
 * and its own Refer button, that duplication bought nothing but a second place
 * to keep in sync.
 *
 * What stays: name, type, availability, location, phone, distance, and the
 * action. What went: the tag rail and the website link, both on the row.
 */
export function buildPopupContent(
  item: MapItem,
  userRole: string | undefined,
  onReferral: (target: MapItem) => void,
): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'min-width:240px;max-width:280px;font-family:system-ui,-apple-system,sans-serif;'

  const typeBg = item.type === 'clinic' ? '#e0f2fe' : '#fee2e2'
  const typeColor = item.type === 'clinic' ? '#0369a1' : '#b91c1c'
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

  // The professionals and partners maps withhold the street address, so fall
  // back to the coarse location. Without this the popup showed no location at
  // all on two of the three maps.
  const where =
    item.address ?? [item.city, item.state, item.zipCode].filter(Boolean).join(', ')
  if (where) {
    html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
        <span style="color:#94a3b8;flex-shrink:0;margin-top:1px;font-size:13px">&#9906;</span>
        <span>${escapeHtml(where)}</span>
      </div>`
  }

  if (item.phone) {
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="color:#94a3b8;flex-shrink:0;font-size:13px">&#9742;</span>
      <span>${escapeHtml(item.phone)}</span>
    </div>`
  }

  html += `</div>
    <div style="font-size:11px;color:#94a3b8;margin:8px 0;font-weight:500">${item.distance.toFixed(1)} miles away</div>`

  container.innerHTML = html

  // The rule itself lives in `referral-policy.ts`. It used to be written out
  // here, and the panel row now offers the same action — a second copy of a
  // rule whose first duplication already shipped a bug.
  const allowed = canRefer(userRole, item)

  if (allowed && item.available) {
    const btn = document.createElement('button')
    btn.textContent = referLabel(userRole)
    btn.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(135deg,#d4a84b,#c4982f);color:#fff;font-weight:700;font-size:13px;letter-spacing:0.01em;box-shadow:0 2px 8px rgba(212,168,75,0.35);'
    btn.addEventListener('click', () => onReferral(item))
    container.appendChild(btn)
  } else if (allowed && !item.available) {
    const p = document.createElement('p')
    p.textContent = 'Not accepting referrals'
    p.style.cssText = 'font-size:11px;text-align:center;color:#9ca3af;font-style:italic;margin:0;'
    container.appendChild(p)
  }

  return container
}
