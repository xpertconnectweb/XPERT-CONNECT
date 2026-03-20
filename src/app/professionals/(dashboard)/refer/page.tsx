'use client'

import { useState } from 'react'
import { MapPin, ArrowRight } from 'lucide-react'
import { ReferrerReferralForm } from '@/components/professionals/ReferrerReferralForm'

const states = [
  {
    code: 'FL',
    name: 'Florida',
    abbr: 'FL',
    description: 'Miami, Orlando, Tampa & statewide',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
    iconBg: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
    iconColor: '#c2410c',
    cardBg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)',
    borderColor: '#fdba74',
    hoverShadow: '0 20px 60px -12px rgba(249, 115, 22, 0.25)',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    abbr: 'MN',
    description: 'Twin Cities, Rochester & statewide',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
    iconBg: 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)',
    iconColor: '#1d4ed8',
    cardBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)',
    borderColor: '#93c5fd',
    hoverShadow: '0 20px 60px -12px rgba(59, 130, 246, 0.25)',
  },
]

export default function ReferPage() {
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [hoveredState, setHoveredState] = useState<string | null>(null)

  const selected = states.find((s) => s.code === selectedState)

  if (selected) {
    return (
      <ReferrerReferralForm
        state={selected.code}
        stateName={selected.name}
        onBack={() => setSelectedState(null)}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Premium Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-navy/5 to-gold/10 px-4 py-1.5 mb-4">
          <MapPin className="h-3.5 w-3.5 text-gold" />
          <span className="text-xs font-semibold text-navy/70 uppercase tracking-wider">Partner Referral System</span>
        </div>
        <h2 className="font-heading text-3xl font-bold text-navy mb-3">Select a State</h2>
        <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
          Choose the state where the client needs services. You&apos;ll then fill in their details for our team to process.
        </p>
      </div>

      {/* State Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {states.map((s) => {
          const isHovered = hoveredState === s.code
          return (
            <button
              key={s.code}
              onClick={() => setSelectedState(s.code)}
              onMouseEnter={() => setHoveredState(s.code)}
              onMouseLeave={() => setHoveredState(null)}
              className="group relative text-left rounded-2xl overflow-hidden transition-all duration-500"
              style={{
                boxShadow: isHovered ? s.hoverShadow : '0 1px 3px rgba(0,0,0,0.08)',
                transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
              }}
            >
              {/* Card background */}
              <div
                className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                style={{ background: s.cardBg }}
              />
              <div className="absolute inset-0 bg-white/60" />

              {/* Border */}
              <div
                className="absolute inset-0 rounded-2xl transition-all duration-300"
                style={{ border: `2px solid ${isHovered ? s.borderColor : '#e5e7eb'}` }}
              />

              {/* Decorative circle */}
              <div
                className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500"
                style={{ background: s.gradient }}
              />

              <div className="relative p-8">
                {/* State badge */}
                <div
                  className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-5 shadow-lg group-hover:scale-110 transition-transform duration-500"
                  style={{ background: s.gradient }}
                >
                  <span className="text-2xl font-black text-white tracking-tight">{s.abbr}</span>
                </div>

                <h3 className="font-heading text-xl font-bold text-gray-900 mb-1">{s.name}</h3>
                <p className="text-sm text-gray-500 mb-5">{s.description}</p>

                {/* CTA */}
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: s.iconColor }}>
                  <span>Start Referral</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Bottom info */}
      <div className="mt-10 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
            <span className="text-white text-sm font-bold">?</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">How it works</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              After submitting a referral, our admin team reviews the details and assigns the appropriate clinic or attorney based on the client&apos;s location and needs. You can track the status of all your referrals in the <strong className="text-gray-700">My Referrals</strong> section.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
