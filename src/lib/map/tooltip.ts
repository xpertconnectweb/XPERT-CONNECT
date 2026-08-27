import type { MapItem } from './types'

/**
 * What is this pin?
 *
 * The map had no answer to that question short of clicking. With several
 * hundred pins on screen, comparing the four clinics near a client meant four
 * rounds of click, read, dismiss — each one opening a 310px popup that nudges
 * the map and covers its neighbours. A tooltip answers it by pointing.
 *
 * ── Not a second popup ──────────────────────────────────────────────────────
 *
 * `popup.ts` was deliberately shrunk once the results row started carrying the
 * same detail, and re-enriching it would rebuild the duplication that removal
 * was for. These two answer different questions and the split is the point:
 *
 *   tooltip — "what is this pin", on hover, no click, no commitment
 *   popup   — "what do I do about it", on click, and it owns the Refer button
 *
 * The only field they share is the name, which is the one thing an
 * identification cannot omit.
 *
 * ── Built, not concatenated ─────────────────────────────────────────────────
 *
 * `document.createElement` and `textContent` throughout, so a provider called
 * "Smith & Sons <Ortho>" is simply text. `popup.ts` builds an HTML string and
 * needs a hand-rolled `escapeHtml` to stay safe; there is nothing to escape
 * here because nothing is ever parsed as markup.
 */
export function buildMarkerTip(item: MapItem): HTMLElement {
  const root = document.createElement('div')
  root.className = 'xc-tip'

  const name = document.createElement('div')
  name.className = 'xc-tip__name'
  name.textContent = item.name
  root.appendChild(name)

  const meta = document.createElement('div')
  meta.className = 'xc-tip__meta'

  const dot = document.createElement('span')
  dot.className = item.available ? 'xc-tip__dot' : 'xc-tip__dot xc-tip__dot--off'
  meta.appendChild(dot)

  const parts: string[] = [item.type === 'clinic' ? 'Clinic' : 'Attorney']
  if (!item.available) parts.push('not accepting')
  // Zero is the sentinel for "no anchor set", not a clinic on the doorstep.
  if (item.distance > 0) parts.push(`${item.distance.toFixed(1)} mi`)

  const text = document.createElement('span')
  text.textContent = parts.join(' · ')
  meta.appendChild(text)

  root.appendChild(meta)
  return root
}
