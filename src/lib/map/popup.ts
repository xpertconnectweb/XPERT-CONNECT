import type { Clinic } from '@/types/professionals'
import type { MapItem } from './types'

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export function buildPopupContent(
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
