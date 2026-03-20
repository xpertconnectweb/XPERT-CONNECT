'use client'

import { useState } from 'react'
import { ReferrerReferralForm } from '@/components/professionals/ReferrerReferralForm'

const states = [
  {
    code: 'FL',
    name: 'Florida',
    abbr: 'FL',
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    hoverBorder: 'hover:border-orange-400',
    text: 'text-orange-700',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    abbr: 'MN',
    gradient: 'from-blue-600 to-cyan-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    text: 'text-blue-700',
  },
]

export default function ReferPage() {
  const [selectedState, setSelectedState] = useState<string | null>(null)

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
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="font-heading text-2xl font-bold text-gray-900 mb-2">Select a State</h2>
        <p className="text-gray-500">Choose the state where the client needs services</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {states.map((s) => (
          <button
            key={s.code}
            onClick={() => setSelectedState(s.code)}
            className={`group relative rounded-xl ${s.bg} ${s.border} border-2 ${s.hoverBorder} p-8 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
          >
            <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${s.gradient} mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
              <span className="text-2xl font-black text-white">{s.abbr}</span>
            </div>
            <h3 className={`font-heading text-xl font-bold ${s.text}`}>{s.name}</h3>
            <p className="mt-1 text-sm text-gray-500">Refer a client in {s.name}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
