'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Inbox, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { ReferralTable } from './ReferralTable'
import { ReferralList } from './ReferralList'
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

  // Stats
  const received = referrals.filter((r) => r.status === 'received').length
  const inProcess = referrals.filter((r) => r.status === 'in_process').length
  const attended = referrals.filter((r) => r.status === 'attended').length

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy">Referrals</h1>
        <p className="text-sm text-gray-400 mt-1.5">
          {isLawyer
            ? `Track and manage your ${referrals.length} sent referral${referrals.length !== 1 ? 's' : ''}`
            : `Manage your ${referrals.length} incoming referral${referrals.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {updateError && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {updateError}
        </div>
      )}

      {/* Stats Cards */}
      {referrals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Received */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-blue-400" />
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
                <Inbox className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{received}</p>
                <p className="text-xs text-gray-400 font-medium">Received</p>
              </div>
            </div>
          </div>
          {/* In Process */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-amber-400" />
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{inProcess}</p>
                <p className="text-xs text-gray-400 font-medium">In Process</p>
              </div>
            </div>
          </div>
          {/* Attended */}
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-400" />
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{attended}</p>
                <p className="text-xs text-gray-400 font-medium">Attended</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isClinic && (
        <ReferralTable referrals={referrals} onStatusChange={handleStatusChange} />
      )}

      {isLawyer && (
        <ReferralList referrals={referrals} />
      )}
    </div>
  )
}
