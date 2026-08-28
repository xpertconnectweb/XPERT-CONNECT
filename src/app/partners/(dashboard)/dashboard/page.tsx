'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Clock,
  UserCheck,
  CheckCircle2,
  ThumbsUp,
  Ban,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import { cn } from '@/lib/utils'
import { REFERRAL_STATUS_LIST, statusMeta } from '@/lib/referral-status'
import { statusIcon } from '@/lib/referral-status-icons'
import { caseMeta } from '@/lib/case-confirmed'
import type { ReferralStatus } from '@/types/professionals'

interface PartnerStats {
  total: number
  byStatus: Record<ReferralStatus, number>
  completed: number
  confirmed: number
  dropped: number
  unassigned: number
  /** The raw key is authoritative — the colour comes from the catalog, not
   *  from this array's position, which is how a fifth stage used to render
   *  with `fill={undefined}`. */
  statusBreakdown: { status: string; label: string; value: number }[]
  recentReferrals: {
    id: string
    clientName: string
    serviceNeeded: string
    status: string
    caseConfirmed: string
    state: string
    createdAt: string
  }[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PartnerDashboardPage() {
  const [stats, setStats] = useState<PartnerStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/partners/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats')
        return res.json()
      })
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Failed to load dashboard.</p>
      </div>
    )
  }

  const pieTotal = stats.statusBreakdown.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="space-y-6">
      {/* Stat Cards — Total plus one tile per lifecycle stage */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
              <p className="text-[11px] text-gray-400 font-medium">Total Referrals</p>
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
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.byStatus[m.value as ReferralStatus] ?? 0}</p>
                  <p className="text-[11px] text-gray-400 font-medium">{m.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Case outcome — the confirmed rate keeps dropped cases in its
          denominator, so the counts are stated outright. */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fefce8, #fef9c3)' }}>
              <ThumbsUp className="h-4 w-4 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.confirmed}</p>
              <p className="text-[11px] text-gray-400 font-medium">Cases Confirmed</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #f8fafc, #e2e8f0)' }}>
              <Ban className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.dropped}</p>
              <p className="text-[11px] text-gray-400 font-medium">Dropped</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
              <UserCheck className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.unassigned}</p>
              <p className="text-[11px] text-gray-400 font-medium">Awaiting assignment</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart - Referral Status */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-navy">Referral Status</h2>
            <p className="text-xs text-gray-400 mt-0.5">Current distribution</p>
          </div>
          {pieTotal === 0 ? (
            <div className="flex items-center justify-center h-[220px]">
              <div className="text-center">
                <FileText className="mx-auto h-8 w-8 text-gray-200" />
                <p className="text-sm text-gray-400 mt-2">No referrals yet</p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusBreakdown.filter((e) => e.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats.statusBreakdown.filter((e) => e.value > 0).map((e) => (
                        <Cell key={e.status} fill={statusMeta(e.status).hex} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: 16 }}>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{pieTotal}</p>
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Total</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-5 mt-2">
                {stats.statusBreakdown.map((entry) => (
                  <div key={entry.status} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: statusMeta(entry.status).hex }} />
                    <span className="text-xs text-gray-500">{entry.label}</span>
                    <span className="text-xs font-semibold text-gray-700">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent Referrals Table */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-heading text-base font-bold text-navy">Recent Referrals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Latest 5 submissions</p>
          </div>
          {stats.recentReferrals.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400 mt-2">No referrals yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Client</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">State</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Medical Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Case</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {stats.recentReferrals.map((ref) => {
                    const sc = statusMeta(ref.status)
                    const cc = caseMeta(ref.caseConfirmed)
                    return (
                      <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-gray-900 text-xs">{ref.clientName}</p>
                          <p className="text-[11px] text-gray-400">{ref.serviceNeeded === 'lawyer' ? 'Attorney' : ref.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                            {ref.state === 'FL' ? '🌴' : '❄️'} {ref.state}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sc.badgeClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.accentClass}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cc.badgeClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cc.accentClass}`} />
                            {cc.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 text-[11px] whitespace-nowrap">{formatDate(ref.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
