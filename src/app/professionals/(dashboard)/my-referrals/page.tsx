'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, Clock, UserCheck, CheckCircle2, X, TrendingUp, Inbox } from 'lucide-react'
import type { ReferrerReferral } from '@/types/professionals'

const statusConfig: Record<string, { label: string; color: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending', color: '#9ca3af', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  assigned: { label: 'Assigned', color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  in_process: { label: 'In Process', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  completed: { label: 'Completed', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MyReferralsPage() {
  const [referrals, setReferrals] = useState<ReferrerReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ReferrerReferral | null>(null)

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/professionals/referrer-referrals')
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

  const total = referrals.length
  const pending = referrals.filter((r) => r.status === 'pending').length
  const active = referrals.filter((r) => r.status === 'assigned' || r.status === 'in_process').length
  const completed = referrals.filter((r) => r.status === 'completed').length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
        <span className="sr-only">Loading referrals...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">My Referrals</h1>
          <p className="text-sm text-gray-400 mt-1">
            Track and monitor your {total} submitted referral{total !== 1 ? 's' : ''}
          </p>
        </div>
        {total > 0 && (
          <div className="hidden sm:flex items-center gap-2 rounded-xl bg-navy/5 px-4 py-2">
            <TrendingUp className="h-4 w-4 text-navy" />
            <span className="text-sm font-semibold text-navy">{completionRate}%</span>
            <span className="text-xs text-gray-500">completed</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Total */}
          <div className="group rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
                <FileText className="h-[18px] w-[18px] text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{total}</p>
                <p className="text-[11px] text-gray-400 font-medium">Total</p>
              </div>
            </div>
          </div>
          {/* Pending */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-amber-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                <Clock className="h-[18px] w-[18px] text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{pending}</p>
                <p className="text-[11px] text-gray-400 font-medium">Pending</p>
              </div>
            </div>
          </div>
          {/* Active */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-blue-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
                <UserCheck className="h-[18px] w-[18px] text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{active}</p>
                <p className="text-[11px] text-gray-400 font-medium">Active</p>
              </div>
            </div>
          </div>
          {/* Completed */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{completed}</p>
                <p className="text-[11px] text-gray-400 font-medium">Completed</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Bar */}
      {total > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referral Pipeline</p>
            <p className="text-xs text-gray-400">{completed} of {total} completed</p>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-0.5">
            {pending > 0 && (
              <div className="rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${(pending / total) * 100}%` }} title={`${pending} Pending`} />
            )}
            {active > 0 && (
              <div className="rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${(active / total) * 100}%` }} title={`${active} Active`} />
            )}
            {completed > 0 && (
              <div className="rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${(completed / total) * 100}%` }} title={`${completed} Completed`} />
            )}
          </div>
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-gray-500">Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-[11px] text-gray-500">Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-gray-500">Completed</span>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {referrals.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
              <Inbox className="h-6 w-6 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-900">No referrals yet</p>
            <p className="text-sm text-gray-400 mt-1.5 max-w-xs mx-auto">
              Your submitted referrals will appear here. Start by referring a client.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Client</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">State</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Service</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case Type</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className="hover:bg-gray-50/70 cursor-pointer transition-colors duration-150"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{r.clientName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{r.clientPhone}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {r.state === 'FL' ? '🌴' : '❄️'} {r.state}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}
                      </td>
                      <td className="px-5 py-4 text-gray-600">{r.caseType}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${sc.bg} ${sc.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header with gradient */}
            <div className="relative overflow-hidden px-6 pt-6 pb-5">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white" />
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg font-bold text-gray-900">Referral Details</h2>
                  <p className="text-xs text-gray-400 mt-0.5">ID: {detail.id.slice(0, 16)}...</p>
                </div>
                <button onClick={() => setDetail(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* Status badge */}
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-500">Current Status</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${(statusConfig[detail.status] || statusConfig.pending).bg} ${(statusConfig[detail.status] || statusConfig.pending).text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${(statusConfig[detail.status] || statusConfig.pending).dot}`} />
                  {(statusConfig[detail.status] || statusConfig.pending).label}
                </span>
              </div>

              {/* Client Info */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client Information</p>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Name</span>
                    <span className="text-sm font-medium text-gray-900">{detail.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Phone</span>
                    <span className="text-sm text-gray-700">{detail.clientPhone}</span>
                  </div>
                  {detail.clientEmail && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Email</span>
                      <span className="text-sm text-gray-700">{detail.clientEmail}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-sm text-gray-400 shrink-0">Address</span>
                    <span className="text-sm text-gray-700 text-right">{detail.clientAddress}</span>
                  </div>
                </div>
              </div>

              {/* Referral Info */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Referral Details</p>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">State</span>
                    <span className="text-sm text-gray-700">{detail.state === 'FL' ? 'Florida' : 'Minnesota'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Service</span>
                    <span className="text-sm text-gray-700">{detail.serviceNeeded === 'lawyer' ? 'Attorney' : detail.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Case Type</span>
                    <span className="text-sm text-gray-700">{detail.caseType}</span>
                  </div>
                  {detail.notes && (
                    <div className="pt-1">
                      <span className="text-sm text-gray-400">Notes</span>
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">{detail.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment (if assigned) */}
              {(detail.assignedClinicName || detail.assignedLawyerName) && (
                <div className="rounded-xl border border-emerald-100 overflow-hidden" style={{ background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)' }}>
                  <div className="px-4 py-2.5 border-b border-emerald-100" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Assignment</p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    {detail.assignedClinicName && (
                      <div className="flex justify-between">
                        <span className="text-sm text-emerald-600/70">Clinic</span>
                        <span className="text-sm font-medium text-emerald-800">{detail.assignedClinicName}</span>
                      </div>
                    )}
                    {detail.assignedLawyerName && (
                      <div className="flex justify-between">
                        <span className="text-sm text-emerald-600/70">Attorney</span>
                        <span className="text-sm font-medium text-emerald-800">{detail.assignedLawyerName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="pt-2 text-center">
                <p className="text-xs text-gray-300">Submitted {formatDate(detail.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
