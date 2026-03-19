'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import {
  Building2,
  Calendar,
  FileText,
  MapPin,
  MessageSquare,
  Eye,
  X,
  User,
  Phone,
  Shield,
  FileCheck,
  Briefcase,
  Clock,
} from 'lucide-react'
import type { Referral } from '@/types/professionals'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

/* ── Detail Modal ── */
function ReferralDetailModal({ referral, onClose }: { referral: Referral; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  const statusColor = {
    received: 'from-blue-500 to-blue-600',
    in_process: 'from-amber-500 to-amber-600',
    attended: 'from-emerald-500 to-emerald-600',
  }[referral.status]

  const rows = [
    { icon: User, label: 'Patient', value: referral.patientName },
    { icon: Phone, label: 'Phone', value: referral.patientPhone },
    { icon: Building2, label: 'Clinic', value: referral.clinicName },
    { icon: Briefcase, label: 'Case Type', value: referral.caseType },
    { icon: Shield, label: 'Coverage', value: referral.coverage },
    { icon: FileCheck, label: 'PIP', value: referral.pip },
    { icon: Calendar, label: 'Created', value: formatDateTime(referral.createdAt) },
    { icon: Clock, label: 'Updated', value: formatDateTime(referral.updatedAt) },
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
          {/* Status pill inside header */}
          <div className="relative mt-3">
            <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${statusColor} px-3.5 py-1.5 shadow-lg`}>
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {referral.status === 'in_process' ? 'In Process' : referral.status === 'attended' ? 'Attended' : 'Received'}
              </span>
            </div>
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0 divide-y divide-gray-100">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <Icon className="h-4 w-4 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{value || '—'}</p>
              </div>
            </div>
          ))}

          {/* Notes */}
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

/* ── Main List ── */
interface ReferralListProps {
  referrals: Referral[]
}

export function ReferralList({ referrals }: ReferralListProps) {
  const [selected, setSelected] = useState<Referral | null>(null)

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
    <>
      {/* Table view */}
      <div className="rounded-2xl bg-white border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-sm font-bold text-navy">All Referrals</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-white rounded-full px-2.5 py-0.5 border border-gray-200">
            {referrals.length} total
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Clinic</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Case Type</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Coverage</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-5 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80">
              {referrals.map((ref) => (
                <tr key={ref.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{ref.patientName}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{ref.patientPhone}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <span className="text-gray-700 text-xs">{ref.clinicName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600 border border-gray-100">
                      <FileText className="h-3 w-3 text-gray-400" />
                      {ref.caseType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-600 font-medium">{ref.coverage || '—'}</td>
                  <td className="px-5 py-4">
                    <p className="text-xs text-gray-500">{formatDate(ref.createdAt)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(ref.createdAt)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={ref.status} />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => setSelected(ref)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-navy/5 hover:text-navy transition-all"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100/60">
          {referrals.map((ref) => (
            <div key={ref.id} className="relative p-5 space-y-3 hover:bg-gray-50/50 transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gold/40" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{ref.patientName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ref.patientPhone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ref.status} />
                  <button
                    onClick={() => setSelected(ref)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-navy/5 hover:text-navy transition-all"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-3.5 w-3.5 text-gray-300" />
                <span className="text-gray-600 text-xs">{ref.clinicName}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <FileText className="h-3 w-3 text-gray-300" />
                  {ref.caseType}
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Calendar className="h-3 w-3 text-gray-300" />
                  {formatDate(ref.createdAt)}
                </div>
              </div>
              {ref.notes && (
                <p className="text-xs text-gray-500 bg-gray-50/80 rounded-xl p-3 border border-gray-100/60 line-clamp-2">{ref.notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <ReferralDetailModal referral={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
