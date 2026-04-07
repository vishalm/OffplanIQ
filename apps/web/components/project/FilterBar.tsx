'use client'
// apps/web/components/project/FilterBar.tsx

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const AREAS = [
  'Business Bay', 'Downtown Dubai', 'Dubai Marina',
  'JVC', 'JLT', 'Creek Harbour', 'Dubai Harbour',
  'Palm Jumeirah', 'Meydan', 'Arjan',
]

const HANDOVER_STATUSES = [
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk',  label: 'At risk' },
  { value: 'delayed',  label: 'Delayed' },
]

interface Props {
  currentFilters: {
    area?: string
    status?: string
    sort?: string
    q?: string
  }
}

export function FilterBar({ currentFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const updateFilter = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams()
    if (currentFilters.area   && key !== 'area')   params.set('area',   currentFilters.area)
    if (currentFilters.status && key !== 'status') params.set('status', currentFilters.status)
    if (currentFilters.q      && key !== 'q')      params.set('q',      currentFilters.q)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }, [currentFilters, pathname, router])

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* Search */}
      <input
        placeholder="Search project or developer…"
        defaultValue={currentFilters.q}
        onChange={e => updateFilter('q', e.target.value || null)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />

      {/* Area chips */}
      <button
        onClick={() => updateFilter('area', null)}
        className={`text-xs px-3 py-1.5 rounded-full border transition ${
          !currentFilters.area
            ? 'bg-gray-900 text-white border-gray-900'
            : 'border-gray-200 text-gray-500 hover:border-gray-400'
        }`}
      >
        All areas
      </button>
      {AREAS.map(area => (
        <button
          key={area}
          onClick={() => updateFilter('area', currentFilters.area === area ? null : area)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            currentFilters.area === area
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          {area}
        </button>
      ))}

      {/* Sort */}
      <div className="ml-auto">
        <select
          value={currentFilters.sort ?? 'score'}
          onChange={e => updateFilter('sort', e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-500 focus:outline-none"
        >
          <option value="score">Sort: Score</option>
          <option value="psf_delta">Sort: PSF growth</option>
          <option value="sellthrough">Sort: Sell-through</option>
          <option value="launch_date">Sort: Newest</option>
        </select>
      </div>
    </div>
  )
}
