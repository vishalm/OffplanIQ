'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface FilterOption { value: string; label: string; count: number }

interface Props {
  currentFilters: Record<string, string | undefined>
  cities: FilterOption[]
  districts: FilterOption[]
  developers: FilterOption[]
  handoverStatuses: FilterOption[]
  scoreRange: { min: number; max: number }
  psfRange: { min: number; max: number }
  totalCount: number
  filteredCount: number
}

export function FilterSidebar({
  currentFilters, cities, districts, developers, handoverStatuses,
  scoreRange, psfRange, totalCount, filteredCount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams()
    const merged = { ...currentFilters }
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) delete merged[k]
      else merged[k] = v
    }
    // When changing city, clear district
    if ('city' in updates && updates.city !== currentFilters.city) delete merged.area
    // Reset page on any filter change
    delete merged.page

    for (const [k, v] of Object.entries(merged)) { if (v) params.set(k, v) }
    router.push(`${pathname}?${params.toString()}`)
  }, [currentFilters, pathname, router])

  const isActive = (key: string, value: string) => currentFilters[key] === value
  const hasFilters = Object.keys(currentFilters).some(k => k !== 'sort' && k !== 'page' && currentFilters[k])

  return (
    <aside className="w-[220px] shrink-0 space-y-5">
      {/* Result count */}
      <div>
        <p className="text-xs text-gray-400">{filteredCount} of {totalCount} projects</p>
        {hasFilters && (
          <button onClick={() => router.push(pathname)} className="text-[11px] text-blue-600 hover:underline mt-1">
            Clear all filters
          </button>
        )}
      </div>

      {/* Search */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Search</p>
        <input
          placeholder="Project or developer..."
          defaultValue={currentFilters.q}
          onChange={e => {
            const v = e.target.value
            clearTimeout((window as any).__searchTimer)
            ;(window as any).__searchTimer = setTimeout(() => update({ q: v || null }), 400)
          }}
          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
        />
      </div>

      {/* City */}
      <FilterSection title="City" options={cities} activeValue={currentFilters.city}
        onSelect={v => update({ city: v === currentFilters.city ? null : v })} />

      {/* District (only when city selected) */}
      {districts.length > 0 && (
        <FilterSection title="District" options={districts} activeValue={currentFilters.area}
          onSelect={v => update({ area: v === currentFilters.area ? null : v })} />
      )}

      {/* Developer */}
      <FilterSection title="Developer" options={developers} activeValue={currentFilters.developer}
        onSelect={v => update({ developer: v === currentFilters.developer ? null : v })} />

      {/* Handover Status */}
      <FilterSection title="Handover" options={handoverStatuses} activeValue={currentFilters.status}
        onSelect={v => update({ status: v === currentFilters.status ? null : v })} />

      {/* Score range */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Score</p>
        <div className="flex gap-1">
          {[
            { label: '85+', value: '85', color: 'bg-green-100 text-green-700' },
            { label: '70+', value: '70', color: 'bg-emerald-100 text-emerald-700' },
            { label: '55+', value: '55', color: 'bg-amber-100 text-amber-700' },
            { label: '<55', value: '0', color: 'bg-red-100 text-red-600' },
          ].map(opt => (
            <button key={opt.value}
              onClick={() => update({ minScore: currentFilters.minScore === opt.value ? null : opt.value })}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
                currentFilters.minScore === opt.value ? opt.color + ' ring-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* PSF range */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">PSF range</p>
        <div className="flex gap-1 flex-wrap">
          {[
            { label: '<1.5K', value: '0-1500' },
            { label: '1.5-3K', value: '1500-3000' },
            { label: '3-5K', value: '3000-5000' },
            { label: '5K+', value: '5000-99999' },
          ].map(opt => (
            <button key={opt.value}
              onClick={() => update({ psf: currentFilters.psf === opt.value ? null : opt.value })}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
                currentFilters.psf === opt.value ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Sort by</p>
        <select value={currentFilters.sort ?? 'score'}
          onChange={e => update({ sort: e.target.value })}
          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="score">Score (high to low)</option>
          <option value="score_asc">Score (low to high)</option>
          <option value="psf">PSF (high to low)</option>
          <option value="psf_asc">PSF (low to high)</option>
          <option value="sellthrough">Sell-through (high to low)</option>
          <option value="name">Name (A to Z)</option>
          <option value="handover">Handover (soonest)</option>
        </select>
      </div>
    </aside>
  )
}

function FilterSection({ title, options, activeValue, onSelect }: {
  title: string; options: FilterOption[]; activeValue?: string; onSelect: (v: string) => void
}) {
  if (options.length === 0) return null
  const showAll = options.length <= 8
  const visible = showAll ? options : options.slice(0, 6)

  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-0.5">
        {visible.map(opt => (
          <button key={opt.value} onClick={() => onSelect(opt.value)}
            className={`w-full text-left text-[13px] px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between ${
              activeValue === opt.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="truncate">{opt.label}</span>
            <span className="text-[11px] text-gray-400 tabular-nums ml-2">{opt.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
