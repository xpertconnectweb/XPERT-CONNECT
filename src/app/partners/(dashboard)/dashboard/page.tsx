'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Clock,
  UserCheck,
  CheckCircle2,
  ThumbsUp,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface PartnerStats {
  total: number
  pending: number
  active: number
  completed: number
  confirmed: number
  statusBreakdown: { name: string; value: number }[]
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

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981']

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  assigned: { label: 'Assigned', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  in_process: { label: 'In Process', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
}

const caseConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  confirmed: { label: 'Confirmed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
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
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
              <FileText className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
              <p className="text-[11px] text-gray-400 font-medium">Total Referrals</p>
            </div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-amber-400" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
              <Clock className="h-[18px] w-[18px] text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.pending}</p>
              <p className="text-[11px] text-gray-400 font-medium">Pending</p>
            </div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-blue-400" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
              <UserCheck className="h-[18px] w-[18px] text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.active}</p>
              <p className="text-[11px] text-gray-400 font-medium">Active</p>
            </div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-400" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
              <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.completed}</p>
              <p className="text-[11px] text-gray-400 font-medium">Completed</p>
            </div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gold" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fefce8, #fef9c3)' }}>
              <ThumbsUp className="h-[18px] w-[18px] text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.confirmed}</p>
              <p className="text-[11px] text-gray-400 font-medium">Cases Confirmed</p>
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
                      data={stats.statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats.statusBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
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
                {stats.statusBreakdown.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                    <span className="text-xs text-gray-500">{entry.name}</span>
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
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Case</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {stats.recentReferrals.map((ref) => {
                    const sc = statusConfig[ref.status] || statusConfig.pending
                    const cc = caseConfig[ref.caseConfirmed] || caseConfig.pending
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
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cc.bg} ${cc.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />
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
