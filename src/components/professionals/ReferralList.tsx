'use client'

import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import { Building2, Calendar, FileText, MapPin } from 'lucide-react'
import type { Referral } from '@/types/professionals'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface ReferralListProps {
  referrals: Referral[]
}

export function ReferralList({ referrals }: ReferralListProps) {
  if (referrals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
          <MapPin className="h-6 w-6 text-gray-400" />
        </div>
        <p className="font-medium text-gray-900">No referrals yet</p>
        <p className="text-sm text-gray-500 mt-1 mb-4">Head to the map to send your first referral.</p>
        <Link
          href="/professionals/map"
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark transition-colors"
        >
          <MapPin className="h-4 w-4" />
          Go to Map
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {referrals.map((ref) => (
        <div
          key={ref.id}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-heading text-base font-bold text-navy">
              {ref.patientName}
            </h3>
            <StatusBadge status={ref.status} />
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span>{ref.clinicName}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span>{ref.caseType}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span>{formatDate(ref.createdAt)}</span>
            </div>
          </div>

          {ref.notes && (
            <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-100 pt-3">
              {ref.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
