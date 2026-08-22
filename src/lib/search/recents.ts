/**
 * Recent searches, persisted per browser.
 *
 * Written only on a *committed* search — pressing Enter or picking a
 * suggestion — never on a keystroke, or the list fills with prefixes of one
 * query.
 */

const KEY = 'xc:recent-searches:v1'
const MAX = 8

export interface RecentSearch {
  query: string
  /** The place the search was anchored to, when there was one. */
  near?: { lat: number; lng: number; label: string }
  /** Epoch millis; supplied by the caller so this module stays pure-ish. */
  at: number
}

function available(): Storage | null {
  // Safari in private mode throws on access, not just on write.
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function isRecent(value: unknown): value is RecentSearch {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.query === 'string' && candidate.query.length > 0
}

export function readRecents(): RecentSearch[] {
  const store = available()
  if (!store) return []
  try {
    const raw = store.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecent).slice(0, MAX)
  } catch {
    return []
  }
}

/** Adds an entry MRU-first, de-duplicating on the query text. */
export function addRecent(entry: RecentSearch): RecentSearch[] {
  const query = entry.query.trim()
  if (!query) return readRecents()

  const folded = query.toLowerCase()
  const next = [
    { ...entry, query },
    ...readRecents().filter((r) => r.query.toLowerCase() !== folded),
  ].slice(0, MAX)

  const store = available()
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(next))
    } catch {
      // Quota exceeded or storage disabled — recents are a convenience.
    }
  }
  return next
}

/** Drops a single entry, matched case-insensitively on its query text. */
export function removeRecent(query: string): RecentSearch[] {
  const folded = query.trim().toLowerCase()
  const next = readRecents().filter((r) => r.query.toLowerCase() !== folded)

  const store = available()
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage disabled; nothing to persist.
    }
  }
  return next
}

export function clearRecents(): void {
  const store = available()
  if (!store) return
  try {
    store.removeItem(KEY)
  } catch {
    // Nothing to do; the list is already effectively empty.
  }
}
