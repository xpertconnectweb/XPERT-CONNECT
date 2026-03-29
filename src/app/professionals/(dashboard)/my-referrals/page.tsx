'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, Clock, UserCheck, CheckCircle2, X, TrendingUp, Inbox, User, Phone, Mail, MapPin, Briefcase, Shield, Calendar, MessageSquare, Scale } from 'lucide-react'
import type { ReferrerReferral, CaseConfirmedStatus } from '@/types/professionals'

const statusConfig: Record<string, { label: string; color: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  assigned: { label: 'Assigned', color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  in_process: { label: 'In Process', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  completed: { label: 'Completed', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
}

const caseConfig: Record<string, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', ring: 'ring-amber-600/20' },
  confirmed: { label: 'Confirmed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', ring: 'ring-emerald-600/20' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const statusGradient: Record<string, string> = {
  pending: 'from-amber-400 to-amber-500',
  assigned: 'from-blue-500 to-blue-600',
  in_process: 'from-amber-500 to-amber-600',
  completed: 'from-emerald-500 to-emerald-600',
}

/* ── Partner Detail Modal ── */
function PartnerDetailModal({ referral, onClose }: { referral: ReferrerReferral; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  const sc = statusConfig[referral.status] || statusConfig.pending
  const cc = caseConfig[referral.caseConfirmed] || caseConfig.pending
  const gradient = statusGradient[referral.status] || statusGradient.pending

  const rows: { icon: typeof User; label: string; value: string | null | undefined }[] = [
    { icon: User, label: 'Client', value: referral.clientName },
    { icon: Phone, label: 'Phone', value: referral.clientPhone },
    { icon: Mail, label: 'Email', value: referral.clientEmail },
    { icon: MapPin, label: 'Address', value: referral.clientAddress },
    { icon: Scale, label: 'State', value: referral.state === 'FL' ? 'Florida' : 'Minnesota' },
    { icon: Briefcase, label: 'Service', value: referral.serviceNeeded === 'lawyer' ? 'Attorney' : referral.serviceNeeded === 'both' ? 'Both' : 'Clinic' },
    { icon: Shield, label: 'Case Type', value: referral.caseType },
    ...(referral.status !== 'pending' ? [{ icon: UserCheck, label: 'Assignment', value: 'Assigned' }] : []),
    { icon: CheckCircle2, label: 'Case Confirmed', value: cc.label },
    { icon: Calendar, label: 'Submitted', value: formatDateTime(referral.createdAt) },
  ]

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-modal-in overflow-hidden">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-r from-[#1a2a4a] to-[#2a3f6a] px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-start justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">Referral Details</h2>
              <p className="text-sm text-white/50 mt-0.5">ID: {referral.id.slice(0, 8)}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-all"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Status pill */}
          <div className="relative mt-3">
            <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${gradient} px-3.5 py-1.5 shadow-lg`}>
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {sc.label}
              </span>
            </div>
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0 divide-y divide-gray-100">
          {rows.map(({ icon: Icon, label, value }) => {
            if (!value) return null
            if (label === 'Case Confirmed') {
              return (
                <div key={label} className="flex items-center gap-3 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                    <Icon className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cc.bg} ${cc.text} ${cc.ring}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />
                      {cc.label}
                    </span>
                  </div>
                </div>
              )
            }
            return (
              <div key={label} className="flex items-center gap-3 py-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                  <Icon className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{value}</p>
                </div>
              </div>
            )
          })}

          {referral.notes && (
            <div className="py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 mt-0.5">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">
                    {referral.notes}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
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
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-sm font-bold text-navy">My Referrals</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-white rounded-full px-2.5 py-0.5 border border-gray-200">
            {referrals.length} total
          </span>
        </div>
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
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/50">
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Client</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">State</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Service</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case Type</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {referrals.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  const cc = caseConfig[r.caseConfirmed] || caseConfig.pending
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
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${sc.bg} ${sc.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cc.bg} ${cc.text} ${cc.ring}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />
                          {cc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100/60">
            {referrals.map((r) => {
              const sc = statusConfig[r.status] || statusConfig.pending
              const cc = caseConfig[r.caseConfirmed] || caseConfig.pending
              return (
                <div
                  key={r.id}
                  className="relative p-5 space-y-3 hover:bg-gray-50/50 transition-colors cursor-pointer"
                  onClick={() => setDetail(r)}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gold/40" />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{r.clientName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.clientPhone}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${sc.bg} ${sc.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Service</p>
                      <p className="text-gray-700 mt-0.5">{r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Case Type</p>
                      <p className="text-gray-700 mt-0.5">{r.caseType}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{formatDate(r.createdAt)}</p>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cc.bg} ${cc.text} ${cc.ring}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />
                      {cc.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <PartnerDetailModal referral={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
