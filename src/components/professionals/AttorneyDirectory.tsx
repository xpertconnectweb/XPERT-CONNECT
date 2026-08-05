'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Search, Scale, MapPin, Phone, Copy, Check, FilterX,
  HeartPulse, Gavel, Users, ScrollText, Plane, Briefcase, Home,
} from 'lucide-react'
import type { Lawyer } from '@/types/professionals'
import type { SidebarIcon } from '@/components/shared/BaseSidebar'

/**
 * Presentation for the canonical areas in src/lib/practice-areas.ts.
 * Kept here rather than in the lib so that module stays free of React
 * and Tailwind — it is imported by API routes. Areas an admin adds via
 * /admin/settings fall back to the neutral default below.
 */
const AREA_META: Record<string, { icon: SidebarIcon; accent: string }> = {
  'Personal Injury': { icon: HeartPulse, accent: 'from-rose-500 to-red-600' },
  'Criminal Defense': { icon: Gavel, accent: 'from-slate-600 to-slate-800' },
  'Family Law': { icon: Users, accent: 'from-amber-500 to-orange-600' },
  'Estate Planning': { icon: ScrollText, accent: 'from-emerald-500 to-teal-600' },
  Immigration: { icon: Plane, accent: 'from-sky-500 to-blue-600' },
  'Business Law': { icon: Briefcase, accent: 'from-indigo-500 to-violet-600' },
  'Civil Litigation': { icon: Scale, accent: 'from-cyan-500 to-sky-600' },
  'Real Estate Law': { icon: Home, accent: 'from-lime-500 to-green-600' },
}
const DEFAULT_META = { icon: Scale, accent: 'from-gray-500 to-gray-700' }

function metaFor(area: string) {
  return AREA_META[area] ?? DEFAULT_META
}

/** "1000 Legion Pl #1000, Orlando, FL 32801" → "Orlando" */
function cityOf(address: string): string {
  const parts = address.split(',').map((p) => p.trim())
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}

export function AttorneyDirectory({ catalog }: { catalog: string[] }) {
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [county, setCounty] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/directory/lawyers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load attorneys'))))
      .then((data: Lawyer[]) => {
        if (!cancelled) setLawyers(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attorneys')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const countyOptions = useMemo(() => {
    const set = new Set<string>()
    lawyers.forEach((l) => l.county && set.add(l.county))
    return Array.from(set).sort()
  }, [lawyers])

  // Card counts are scoped by county but NOT by the search box, so
  // typing never collapses the category grid out from under the user.
  const scoped = useMemo(
    () => (county ? lawyers.filter((l) => l.county === county) : lawyers),
    [lawyers, county]
  )

  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>()
    scoped.forEach((l) =>
      l.practiceAreas.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    )
    return counts
  }, [scoped])

  const visibleAreas = useMemo(
    () => catalog.filter((a) => (areaCounts.get(a) ?? 0) > 0 || a === area),
    [catalog, areaCounts, area]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scoped.filter((l) => {
      if (area && !l.practiceAreas.includes(area)) return false
      if (!q) return true
      const haystack = [l.name, l.address, l.region, l.county, ...l.practiceAreas]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [scoped, area, query])

  const hasActiveFilters = Boolean(area || county || query)

  const clearFilters = () => {
    setArea('')
    setCounty('')
    setQuery('')
  }

  const copyContact = async (lawyer: Lawyer) => {
    const lines = [lawyer.name, lawyer.address, lawyer.phone, lawyer.practiceAreas.join(', ')]
    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
      setCopiedId(lawyer.id)
      setTimeout(() => setCopiedId((id) => (id === lawyer.id ? null : id)), 1800)
    } catch {
      // Clipboard is unavailable (insecure origin / denied) — the phone
      // number is already visible as a tel: link, so fail quietly.
    }
  }

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-navy">Attorneys</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse the legal network by practice area. Pick a category, then call the firm directly.
            </p>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by firm, city, county..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Practice-area cards — the "types of lawyer" view */}
      {!loading && !error && visibleAreas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleAreas.map((a) => {
            const { icon: Icon, accent } = metaFor(a)
            const count = areaCounts.get(a) ?? 0
            const selected = area === a
            return (
              <button
                key={a}
                type="button"
                data-testid="practice-area-card"
                aria-pressed={selected}
                onClick={() => setArea(selected ? '' : a)}
                className={`group flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all duration-200 ${
                  selected
                    ? 'border-gold bg-gold/5 shadow-md shadow-gold/10 -translate-y-px'
                    : 'border-gray-200/80 bg-white shadow-sm hover:border-gray-300 hover:shadow-md hover:-translate-y-px'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-semibold text-sm text-gray-900 leading-tight">{a}</span>
                <span className="text-[11px] font-medium text-gray-400">
                  {count} {count === 1 ? 'firm' : 'firms'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Secondary filters + result count */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white shadow-sm border border-gray-200/80 px-5 py-3.5">
          <select
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10"
          >
            <option value="">All counties ({countyOptions.length})</option>
            {countyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-500">
            <strong className="text-gray-900" data-testid="directory-result-count">
              {filtered.length}
            </strong>{' '}
            of {lawyers.length} firms
            {area && <span className="text-gray-400"> · {area}</span>}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <FilterX className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Scale className="mx-auto h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400 mt-3">
              {lawyers.length === 0
                ? 'No attorneys available in your state yet.'
                : 'No firms match these filters.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((lawyer) => {
              const city = lawyer.region || cityOf(lawyer.address)
              return (
                <li
                  key={lawyer.id}
                  data-testid="attorney-row"
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-light text-gold">
                    <Scale className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">{lawyer.name}</p>
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          lawyer.available ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}
                        title={lawyer.available ? 'Accepting referrals' : 'Not accepting referrals'}
                      />
                    </div>

                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">{lawyer.address}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {city && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                          <MapPin className="h-3 w-3" />
                          {city}
                        </span>
                      )}
                      {lawyer.county && (
                        <span className="text-[11px] text-gray-400">{lawyer.county}</span>
                      )}
                    </div>

                    {lawyer.practiceAreas.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {lawyer.practiceAreas.slice(0, 4).map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold-dark"
                          >
                            {a}
                          </span>
                        ))}
                        {lawyer.practiceAreas.length > 4 && (
                          <span className="text-[10px] text-gray-400">
                            +{lawyer.practiceAreas.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                    {lawyer.phone && (
                      <a
                        href={`tel:${lawyer.phone.replace(/[^\d+]/g, '')}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-4 py-2 text-xs font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 hover:-translate-y-px transition-all duration-200"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {lawyer.phone}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => copyContact(lawyer)}
                      aria-label={`Copy contact details for ${lawyer.name}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    >
                      {copiedId === lawyer.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
