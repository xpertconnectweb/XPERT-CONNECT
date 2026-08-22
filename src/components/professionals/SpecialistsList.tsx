'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Send, Stethoscope, MapPin } from 'lucide-react'
import { buildSearchIndex, search, toSearchDocs } from '@/lib/search'
import { countyLabel } from '@/lib/counties'
import type { DecoratedClinic } from '@/types/professionals'
import { MedicalSpecialistReferralModal } from './MedicalSpecialistReferralModal'

/**
 * Only a subset of the clinic record is rendered here, but `lat`/`lng`,
 * `city` and `zipCode` are still needed so the shared search core can index
 * the row (and so a placeholder at (0,0) is dropped the same way it is on the
 * map). The API returns them regardless.
 */
type ClinicOption = Pick<
  DecoratedClinic,
  'id' | 'name' | 'region' | 'county' | 'specialties' | 'lat' | 'lng' | 'available' | 'city' | 'state' | 'zipCode'
>

export function SpecialistsList() {
  const router = useRouter()
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [referOpen, setReferOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/professionals/clinics')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load specialists')))
      .then((data: ClinicOption[]) => {
        if (!cancelled) setClinics(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load specialists')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Hide clinics whose only specialties are variants of "Chiropractic" —
  // they are not considered medical specialists in this product. Applied
  // before indexing so the exclusion cannot be bypassed by a search term.
  const index = useMemo(() => {
    const specialists = clinics.filter((c) => {
      if (!c.specialties || c.specialties.length === 0) return true
      return c.specialties.some((s) => !/chiroprac/i.test(s))
    })
    return buildSearchIndex(toSearchDocs(specialists, []))
  }, [clinics])

  const filtered = useMemo(
    () => search(index, query).hits.map((hit) => hit.doc.source),
    [index, query]
  )

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-navy">Medical Specialists</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse clinics in your state. Click <strong>Refer</strong> to send a patient directly.
            </p>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, specialty, region..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-teal-500" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Stethoscope className="mx-auto h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400 mt-3">
              {clinics.length === 0 ? 'No clinics available in your state yet.' : 'No clinics match your search.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((clinic) => (
              <li key={clinic.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#10b981] text-white">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{clinic.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {clinic.region && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {clinic.region}
                      </span>
                    )}
                    {clinic.county && (
                      <span className="text-[11px] text-gray-400">{countyLabel(clinic.county)}</span>
                    )}
                  </div>
                  {clinic.specialties && clinic.specialties.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {clinic.specialties.slice(0, 4).map((s) => (
                        <span key={s} className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                          {s}
                        </span>
                      ))}
                      {clinic.specialties.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{clinic.specialties.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setReferOpen(true)}
                  className="self-start sm:self-center inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] to-[#10b981] px-4 py-2 text-xs font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 hover:-translate-y-px transition-all duration-200"
                >
                  <Send className="h-3.5 w-3.5" />
                  Refer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {referOpen && (
        <MedicalSpecialistReferralModal
          onClose={() => setReferOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
