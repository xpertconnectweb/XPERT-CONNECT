'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Eye, X, FileText, Clock, UserCheck, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LIST,
  isReferralStatus,
  statusMeta,
} from '@/lib/referral-status'
import { statusIcon } from '@/lib/referral-status-icons'
import { caseMeta } from '@/lib/case-confirmed'
import type { ReferrerReferral, ReferralStatus } from '@/types/professionals'

// Exactly what /api/partners/referrals returns: the model minus the internal
// notes the route strips. Re-declaring the shape here is how this screen used
// to keep its own stale copy of both vocabularies.
type PartnerReferral = Omit<ReferrerReferral, 'adminNotes'>

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Render a YYYY-MM-DD accident date without timezone drift.
function formatAccidentDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export default function PartnerReferralsPage() {
  const [referrals, setReferrals] = useState<PartnerReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterState, setFilterState] = useState('')
  const [selected, setSelected] = useState<PartnerReferral | null>(null)

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/partners/referrals')
      if (!res.ok) throw new Error('Failed to fetch')
      setReferrals(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReferrals()
  }, [fetchReferrals])

  // Escape key to close modal
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [selected])

  // Stats
  const total = referrals.length
  const counts = Object.fromEntries(
    REFERRAL_STATUSES.map((s) => [s, 0])
  ) as Record<ReferralStatus, number>
  for (const r of referrals) if (isReferralStatus(r.status)) counts[r.status]++

  // Client-side filters
  const filtered = referrals.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterState && r.state !== filterState) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.clientName.toLowerCase().includes(q) ||
        r.caseType.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">My Referrals</h1>
          <p className="text-sm text-gray-400 mt-1">Track the status of your submitted referrals</p>
        </div>
        <Link
          href="/partners/referrals/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-dark shadow-sm hover:shadow-md transition-all duration-200"
        >
          + New Referral
        </Link>
      </div>

      {/* Stats — Total plus one tile per lifecycle stage */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{total}</p>
                <p className="text-[11px] text-gray-400 font-medium">Total</p>
              </div>
            </div>
          </div>
          {REFERRAL_STATUS_LIST.map((m) => {
            const Icon = statusIcon(m.value)
            return (
              <div
                key={m.value}
                className="group relative rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
              >
                <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full', m.accentClass)} />
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: m.tintGradient }}>
                    <Icon className={cn('h-4 w-4', m.iconClass)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{counts[m.value as ReferralStatus]}</p>
                    <p className="text-[11px] text-gray-400 font-medium">{m.label}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or case type..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
        >
          <option value="">All Statuses</option>
          {REFERRAL_STATUS_LIST.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
        >
          <option value="">All States</option>
          <option value="FL">Florida</option>
          <option value="MN">Minnesota</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-sm font-bold text-navy">Referrals</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-white rounded-full px-2.5 py-0.5 border border-gray-200">
            {filtered.length} total
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
              <FileText className="h-6 w-6 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-900">No referrals found</p>
            <p className="text-sm text-gray-400 mt-1">
              {search || filterStatus || filterState ? 'Try adjusting your filters' : 'Submit your first referral to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/50">
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Client</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">State</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Service</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Medical Status</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Date</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {filtered.map((r) => {
                  const sc = statusMeta(r.status)
                  const cc = caseMeta(r.caseConfirmed)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors duration-150">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{r.clientName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{r.caseType}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {r.state === 'FL' ? '🌴' : '❄️'} {r.state}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${sc.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.accentClass}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cc.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cc.accentClass}`} />
                          {cc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setSelected(r)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gold/10 hover:text-gold transition-colors"
                          aria-label="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal (read-only) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg font-bold text-gray-900">Referral Details</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Submitted {formatDate(selected.createdAt)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Client Information */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client Information</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Name</span><strong className="text-gray-900">{selected.clientName}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-gray-700">{selected.clientPhone}</span></div>
                  {selected.clientEmail && <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-gray-700">{selected.clientEmail}</span></div>}
                  {selected.clientAddress && <div className="flex justify-between items-start gap-4"><span className="text-gray-400 shrink-0">Address</span><span className="text-gray-700 text-right">{selected.clientAddress}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-400">State</span><span className="text-gray-700">{selected.state === 'FL' ? 'Florida' : 'Minnesota'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Service</span><span className="text-gray-700">{selected.serviceNeeded === 'lawyer' ? 'Attorney' : selected.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Case Type</span><span className="text-gray-700">{selected.caseType}</span></div>
                  {selected.accidentDate && (
                    <div className="flex justify-between"><span className="text-gray-400">Date of Accident</span><span className="text-gray-700">{formatAccidentDate(selected.accidentDate)}</span></div>
                  )}
                  {selected.notes && (
                    <div className="pt-1">
                      <span className="text-gray-400">Notes</span>
                      <p className="text-gray-700 mt-0.5">{selected.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Status */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Assignment Status</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Medical Status</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta(selected.status).badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusMeta(selected.status).accentClass}`} />
                      {statusMeta(selected.status).label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Case Confirmed</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${caseMeta(selected.caseConfirmed).badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${caseMeta(selected.caseConfirmed).accentClass}`} />
                      {caseMeta(selected.caseConfirmed).label}
                    </span>
                  </div>
                  {/* Routing is no longer implied by the status, so say it. */}
                  {!selected.assignedClinicName && !selected.assignedLawyerName && (
                    <div className="flex justify-between"><span className="text-gray-400">Assignment</span><span className="text-gray-500">Awaiting assignment</span></div>
                  )}
                  {selected.assignedClinicName && (
                    <div className="flex justify-between"><span className="text-gray-400">Assigned Clinic</span><span className="text-gray-700">{selected.assignedClinicName}</span></div>
                  )}
                  {selected.assignedLawyerName && (
                    <div className="flex justify-between"><span className="text-gray-400">Assigned Attorney</span><span className="text-gray-700">{selected.assignedLawyerName}</span></div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
