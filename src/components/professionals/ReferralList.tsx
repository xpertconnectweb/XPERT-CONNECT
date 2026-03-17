'use client'

import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import { Building2, Calendar, FileText, MapPin, MessageSquare } from 'lucide-react'
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
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 mx-auto mb-4">
          <MapPin className="h-6 w-6 text-gray-300" />
        </div>
        <p className="font-semibold text-gray-900">No referrals yet</p>
        <p className="text-sm text-gray-400 mt-1.5 mb-5 max-w-xs mx-auto">Find a clinic on the map and send your first referral to get started.</p>
        <Link
          href="/professionals/map"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-dark transition-all duration-200 shadow-sm shadow-gold/20"
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
          className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
        >
          {/* Gold accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gold/50 group-hover:bg-gold transition-colors" />

          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-heading text-base font-bold text-navy">
              {ref.patientName}
            </h3>
            <StatusBadge status={ref.status} />
          </div>

          <div className="space-y-2.5 text-sm text-gray-600">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-4 w-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
              <span>{ref.clinicName}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
              <span>{ref.caseType}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar className="h-4 w-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-400">{formatDate(ref.createdAt)}</span>
            </div>
          </div>

          {ref.notes && (
            <div className="mt-4 pt-3 border-t border-gray-100/80">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-gray-400 italic leading-relaxed">
                  {ref.notes}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
