'use client'

import { memo } from 'react'
import { Building2, Scale } from 'lucide-react'
import type { MapItem } from '@/lib/map/types'

export const PanelRow = memo(function PanelRow({
  item,
  onFocus,
}: {
  item: MapItem
  onFocus: (item: MapItem) => void
}) {
  const isClinic = item.type === 'clinic'
  return (
    <button onClick={() => onFocus(item)}
      className="group w-full text-left px-5 py-4 border-b border-gray-100/80 hover:bg-gradient-to-r hover:from-gray-50/80 hover:to-transparent transition-all duration-200 focus:outline-none">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${isClinic ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'}`}>
          {isClinic ? <Building2 className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[13px] text-gray-900 leading-tight group-hover:text-navy transition-colors truncate">{item.name}</h3>
            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 tabular-nums font-medium bg-gray-50 px-2 py-0.5 rounded-md">{item.distance.toFixed(1)} mi</span>
          </div>
          {item.address && <p className="text-[11px] text-gray-500 mt-1 leading-snug truncate">{item.address}</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${item.available ? 'text-emerald-600' : 'text-gray-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${item.available ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-gray-300'}`} />
              {item.available ? 'Available' : 'Unavailable'}
            </span>
            <span className="text-gray-200">|</span>
            <span className="text-[10px] text-gray-400 truncate font-medium">
              {isClinic
                ? item.specialties?.slice(0, 2).join(' \u00B7 ')
                : item.practiceAreas?.slice(0, 2).join(' \u00B7 ')}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
})
