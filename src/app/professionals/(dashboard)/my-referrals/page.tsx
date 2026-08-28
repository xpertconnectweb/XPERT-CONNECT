'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, Clock, UserCheck, CheckCircle2, X, TrendingUp, Inbox, User, Phone, Mail, MapPin, Briefcase, Shield, Calendar, MessageSquare, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LIST,
  TERMINAL_REFERRAL_STATUS,
  isReferralStatus,
  statusMeta,
} from '@/lib/referral-status'
import { statusIcon } from '@/lib/referral-status-icons'
import { caseMeta } from '@/lib/case-confirmed'
import type { ReferrerReferral, ReferralStatus } from '@/types/professionals'

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

/* ── Partner Detail Modal ── */
function PartnerDetailModal({ referral, onClose }: { referral: ReferrerReferral; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  const sc = statusMeta(referral.status)
  const cc = caseMeta(referral.caseConfirmed)

  const rows: { icon: typeof User; label: string; value: string | null | undefined }[] = [
    { icon: User, label: 'Client', value: referral.clientName },
    { icon: Phone, label: 'Phone', value: referral.clientPhone },
    { icon: Mail, label: 'Email', value: referral.clientEmail },
    { icon: MapPin, label: 'Address', value: referral.clientAddress },
    { icon: Scale, label: 'State', value: referral.state === 'FL' ? 'Florida' : 'Minnesota' },
    { icon: Briefcase, label: 'Service', value: referral.serviceNeeded === 'lawyer' ? 'Attorney' : referral.serviceNeeded === 'both' ? 'Both' : 'Clinic' },
    { icon: Shield, label: 'Case Type', value: referral.caseType },
    // Always present, and it now names WHO — routing lives in these columns,
    // not in the medical status.
    {
      icon: UserCheck,
      label: 'Assignment',
      value:
        [referral.assignedClinicName, referral.assignedLawyerName].filter(Boolean).join(' · ') ||
        'Awaiting assignment',
    },
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
            <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${sc.gradientClass} px-3.5 py-1.5 shadow-lg`}>
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
                    <span className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', cc.badgeClass)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', cc.accentClass)} />
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

  // One pass, keyed by the catalog: adding a stage in `referral-status.ts`
  // extends the tiles, the bar and the legend without touching this file.
  const counts = Object.fromEntries(
    REFERRAL_STATUSES.map((s) => [s, 0])
  ) as Record<ReferralStatus, number>
  let confirmed = 0
  let dropped = 0
  for (const r of referrals) {
    if (isReferralStatus(r.status)) counts[r.status]++
    if (r.caseConfirmed === 'confirmed') confirmed++
    else if (r.caseConfirmed === 'drop') dropped++
  }
  const total = referrals.length
  const completed = counts[TERMINAL_REFERRAL_STATUS]
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

      {/* Stats Cards — Total plus one tile per lifecycle stage */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <div className="group rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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

      {/* Pipeline Bar */}
      {total > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referral Pipeline</p>
            <p className="text-xs text-gray-400">{completed} of {total} completed</p>
          </div>
          {/* minWidth keeps a single referral in a large book from rendering as
              a sub-pixel sliver, which reads as a drawing bug in a screenshot. */}
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-0.5">
            {REFERRAL_STATUS_LIST.filter((m) => counts[m.value as ReferralStatus] > 0).map((m) => (
              <div
                key={m.value}
                className={cn('rounded-full transition-all duration-500', m.accentClass)}
                style={{ width: `${(counts[m.value as ReferralStatus] / total) * 100}%`, minWidth: '3px' }}
                title={`${counts[m.value as ReferralStatus]} ${m.label}`}
              />
            ))}
          </div>
          {/* flex-wrap: five legend pills overflow a 360px viewport in one row. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {REFERRAL_STATUS_LIST.map((m) => (
              <div key={m.value} className="flex items-center gap-1.5">
                <div className={cn('h-2 w-2 rounded-full', m.accentClass)} />
                <span className="text-[11px] text-gray-500">{m.label}</span>
              </div>
            ))}
          </div>
          {/* A dropped case stays inside the confirmed-rate denominator, so the
              count is stated outright rather than left to explain a lower %. */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs text-gray-400">Cases confirmed</span>
            <span className="font-mono text-sm font-semibold text-emerald-600 tabular-nums">
              {confirmed}
              {dropped > 0 && <span className="ml-2 text-slate-500">· {dropped} dropped</span>}
            </span>
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
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Medical Status</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {referrals.map((r) => {
                  const sc = statusMeta(r.status)
                  const cc = caseMeta(r.caseConfirmed)
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
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', sc.badgeClass)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', sc.accentClass)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', cc.badgeClass)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', cc.accentClass)} />
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
              const sc = statusMeta(r.status)
              const cc = caseMeta(r.caseConfirmed)
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
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', sc.badgeClass)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', sc.accentClass)} />
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
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', cc.badgeClass)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', cc.accentClass)} />
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
