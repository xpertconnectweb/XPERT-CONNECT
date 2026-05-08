'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Send, Scale, MapPin } from 'lucide-react'
import type { Lawyer } from '@/types/professionals'
import { ClinicReferralFormModal } from './ClinicReferralFormModal'

type LawyerOption = Pick<Lawyer, 'id' | 'name' | 'region' | 'county'> & { practiceAreas?: string[] }

export function SpecialistsList() {
  const router = useRouter()
  const [lawyers, setLawyers] = useState<LawyerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [referTarget, setReferTarget] = useState<LawyerOption | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/professionals/lawyers')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load specialists')))
      .then((data: LawyerOption[]) => {
        if (!cancelled) setLawyers(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load specialists')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lawyers
    return lawyers.filter((l) => {
      const haystack = [l.name, l.region, l.county, ...(l.practiceAreas ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [lawyers, query])

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-navy">Specialists</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse attorneys you can refer patients to. Click <strong>Refer</strong> to send a patient directly.
            </p>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, region, county..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200"
            />
          </div>
        </div>
      </div>

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
              {lawyers.length === 0 ? 'No specialists available in your state yet.' : 'No specialists match your search.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((lawyer) => (
              <li key={lawyer.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a] text-white">
                  <Scale className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{lawyer.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {lawyer.region && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {lawyer.region}
                      </span>
                    )}
                    {lawyer.county && (
                      <span className="text-[11px] text-gray-400">{lawyer.county} County</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReferTarget(lawyer)}
                  className="self-start sm:self-center inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#d4a84b] to-[#c49a3f] px-4 py-2 text-xs font-bold text-white shadow-md shadow-gold/20 hover:shadow-lg hover:shadow-gold/30 hover:-translate-y-px transition-all duration-200"
                >
                  <Send className="h-3.5 w-3.5" />
                  Refer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {referTarget && (
        <ClinicReferralFormModal
          lawyer={referTarget}
          onClose={() => setReferTarget(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
