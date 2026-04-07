'use client'
// apps/web/components/project/FilterBar.tsx
// City → District two-level filter

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

const CITY_DISTRICTS: Record<string, string[]> = {
  'Dubai': [
    'Business Bay', 'Downtown Dubai', 'Dubai Marina', 'Dubai Hills',
    'JVC', 'JLT', 'Creek Harbour', 'Dubai Harbour', 'Palm Jumeirah',
    'Meydan', 'Arjan', 'Damac Hills', 'Sobha Hartland', 'Dubai South',
    'Expo City', 'Al Furjan', 'Motor City', 'Sports City',
    'Arabian Ranches', 'Mohammed Bin Rashid City',
  ],
  'Abu Dhabi': [
    'Saadiyat Island', 'Yas Island', 'Al Reem Island', 'Al Raha Beach',
  ],
  'Ras Al Khaimah': [
    'Al Marjan Island', 'Ras Al Khaimah',
  ],
}

const CITIES = Object.keys(CITY_DISTRICTS)

interface Props {
  currentFilters: {
    city?: string
    area?: string
    status?: string
    sort?: string
    q?: string
  }
}

export function FilterBar({ currentFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const updateFilter = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams()
    const merged = { ...currentFilters, ...updates }
    for (const [k, v] of Object.entries(merged)) {
      if (v && k !== 'sort') params.set(k, v)
    }
    if (merged.sort && merged.sort !== 'score') params.set('sort', merged.sort)
    router.push(`${pathname}?${params.toString()}`)
  }, [currentFilters, pathname, router])

  // Get districts for selected city
  const districts = useMemo(() => {
    if (!currentFilters.city) return []
    return CITY_DISTRICTS[currentFilters.city] ?? []
  }, [currentFilters.city])

  return (
    <div className="space-y-3 mb-5">
      {/* Row 1: Search + City filter + Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          placeholder="Search project or developer..."
          defaultValue={currentFilters.q}
          onChange={e => updateFilter({ q: e.target.value || null })}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* City chips */}
        <button
          onClick={() => updateFilter({ city: null, area: null })}
          className={`text-xs px-3 py-1.5 rounded-full border transition font-medium ${
            !currentFilters.city
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          All cities
        </button>
        {CITIES.map(city => (
          <button
            key={city}
            onClick={() => updateFilter({
              city: currentFilters.city === city ? null : city,
              area: null, // reset district when changing city
            })}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium ${
              currentFilters.city === city
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {city}
          </button>
        ))}

        {/* Sort */}
        <div className="ml-auto">
          <select
            value={currentFilters.sort ?? 'score'}
            onChange={e => updateFilter({ sort: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-500 focus:outline-none"
          >
            <option value="score">Sort: Score</option>
            <option value="psf">Sort: PSF high → low</option>
            <option value="sellthrough">Sort: Sell-through</option>
            <option value="name">Sort: Name A → Z</option>
          </select>
        </div>
      </div>

      {/* Row 2: District chips (only when a city is selected) */}
      {currentFilters.city && districts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pl-1">
          <span className="text-xs text-gray-400 mr-1">District:</span>
          <button
            onClick={() => updateFilter({ area: null })}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${
              !currentFilters.area
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {districts.map(district => (
            <button
              key={district}
              onClick={() => updateFilter({ area: currentFilters.area === district ? null : district })}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                currentFilters.area === district
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {district}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
