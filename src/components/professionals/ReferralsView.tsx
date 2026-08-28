'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, RefreshCw, FileText, TrendingUp } from 'lucide-react'
import { ReferralTable } from './ReferralTable'
import { ReferralList } from './ReferralList'
import { cn } from '@/lib/utils'
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LIST,
  TERMINAL_REFERRAL_STATUS,
  isReferralStatus,
} from '@/lib/referral-status'
import { statusIcon } from '@/lib/referral-status-icons'
import type { Referral, ReferralStatus } from '@/types/professionals'

export function ReferralsView() {
  const { data: session } = useSession()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [updateError, setUpdateError] = useState('')

  const fetchReferrals = useCallback(async () => {
    setError(false)
    try {
      const res = await fetch('/api/professionals/referrals')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setReferrals(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReferrals()
  }, [fetchReferrals])

  // Optimistic status update
  const handleStatusChange = async (id: string, status: ReferralStatus) => {
    setUpdateError('')
    // Optimistically update the UI
    setReferrals((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r
      )
    )

    try {
      const res = await fetch(`/api/professionals/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Update failed')
    } catch {
      setUpdateError('Failed to update status. Please try again.')
      // Revert on failure
      await fetchReferrals()
    }
  }

  const isLawyer = session?.user?.role === 'lawyer'
  const isClinic = session?.user?.role === 'clinic'

  // One pass, keyed by the catalog: adding a stage in `referral-status.ts`
  // extends the tiles, the bar and the legend without touching this file.
  const counts = Object.fromEntries(
    REFERRAL_STATUSES.map((s) => [s, 0])
  ) as Record<ReferralStatus, number>
  for (const r of referrals) if (isReferralStatus(r.status)) counts[r.status]++
  const total = referrals.length
  const completed = counts[TERMINAL_REFERRAL_STATUS]

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
        <span className="sr-only">Loading referrals...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Failed to load referrals</p>
          <p className="text-sm text-gray-400 mt-1">Please try again.</p>
        </div>
        <button
          onClick={fetchReferrals}
          className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-light transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  // Completion rate
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">Referrals</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isLawyer
              ? `Track and manage your ${total} sent referral${total !== 1 ? 's' : ''}`
              : `Manage your ${total} incoming referral${total !== 1 ? 's' : ''}`}
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

      {updateError && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {updateError}
        </div>
      )}

      {/* Stats Cards — Total plus one tile per lifecycle stage */}
      {referrals.length > 0 && (
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

      {/* Progress bar */}
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
        </div>
      )}

      {isClinic && (
        <ReferralTable
          referrals={referrals}
          onStatusChange={handleStatusChange}
          onUpdate={(updated) => setReferrals((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
        />
      )}

      {isLawyer && (
        <ReferralList
          referrals={referrals}
          onUpdate={(updated) => setReferrals((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
        />
      )}
    </div>
  )
}
