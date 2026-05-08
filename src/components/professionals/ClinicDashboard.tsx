'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send, Sparkles, FileText, ArrowRight } from 'lucide-react'
import type { Referral } from '@/types/professionals'
import { ClinicReferralFormModal } from './ClinicReferralFormModal'

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  received: { label: 'Received', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  in_process: { label: 'In Process', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  attended: { label: 'Attended', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface ClinicDashboardProps {
  recentReferrals: Referral[]
}

export function ClinicDashboard({ recentReferrals }: ClinicDashboardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* Giant "Refer to Specialist" CTA */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="group relative w-full overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-[#1a2a4a] via-[#243456] to-[#2a3f6a] p-8 lg:p-12 text-left shadow-xl shadow-navy/10 hover:shadow-2xl hover:shadow-navy/20 transition-all duration-300"
      >
        {/* Gold glow accents */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(212,168,75,0.18),transparent_55%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_85%,rgba(212,168,75,0.10),transparent_50%)] pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8">
          <div className="flex h-20 w-20 lg:h-24 lg:w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d4a84b] to-[#c49a3f] shadow-lg shadow-gold/40 group-hover:scale-105 transition-transform duration-300">
            <Send className="h-10 w-10 lg:h-12 lg:w-12 text-white" strokeWidth={2.2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Quick action</span>
            </div>
            <h1 className="font-heading text-3xl lg:text-5xl font-bold text-white leading-tight tracking-tight">
              Refer to Specialist
            </h1>
            <p className="mt-3 text-sm lg:text-base text-white/70 leading-relaxed max-w-xl">
              Send a patient directly to an attorney specialist. Insurance and adjuster details are optional &mdash; you can update them anytime.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center rounded-xl bg-white/10 group-hover:bg-white/20 px-5 py-3 ring-1 ring-white/20 transition-all duration-300">
            <span className="text-sm font-semibold text-white">Start referral</span>
            <ArrowRight className="h-4 w-4 text-white group-hover:translate-x-1 transition-transform duration-300" />
          </div>
        </div>
      </button>

      {/* Recent referrals */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-heading text-base font-bold text-navy">Recent Referrals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Your latest 5 referrals</p>
          </div>
          <Link
            href="/professionals/referrals"
            className="text-xs font-semibold text-navy hover:text-gold transition-colors duration-200 flex items-center gap-1"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentReferrals.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400 mt-3">No referrals yet</p>
            <p className="text-xs text-gray-500 mt-1">Use the button above to create your first referral.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Specialist</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {recentReferrals.map((ref) => {
                  const sc = statusConfig[ref.status] || statusConfig.received
                  return (
                    <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900 text-xs">{ref.patientName}</p>
                        <p className="text-[11px] text-gray-400">{ref.caseType}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 text-xs">{ref.lawyerName}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
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

      {modalOpen && (
        <ClinicReferralFormModal
          onClose={() => setModalOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
