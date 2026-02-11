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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/20 border-t-gold" />
        <span className="sr-only">Loading referrals...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <div>
          <p className="font-medium text-gray-900">Failed to load referrals</p>
          <p className="text-sm text-gray-500 mt-1">Please try again.</p>
        </div>
        <button
          onClick={fetchReferrals}
          className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-light transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy">Referrals</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isLawyer
            ? `${referrals.length} referral${referrals.length !== 1 ? 's' : ''} sent`
            : `${referrals.length} referral${referrals.length !== 1 ? 's' : ''} received`}
        </p>
      </div>

      {/* Stats Cards */}
      {referrals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Inbox className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{received}</p>
                <p className="text-xs text-gray-500">Received</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{inProcess}</p>
                <p className="text-xs text-gray-500">In Process</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{attended}</p>
                <p className="text-xs text-gray-500">Attended</p>
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
