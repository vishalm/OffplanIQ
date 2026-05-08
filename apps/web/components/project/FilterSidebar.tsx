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
  unitTypes: FilterOption[]
  priceBuckets: FilterOption[]
  psfBuckets: FilterOption[]
  scoreBuckets: FilterOption[]
  totalCount: number
  filteredCount: number
}

export function FilterSidebar({
  currentFilters, cities, districts, developers, handoverStatuses,
  unitTypes, priceBuckets, psfBuckets, scoreBuckets,
  totalCount, filteredCount,
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
    if ('city' in updates && updates.city !== currentFilters.city) delete merged.area
    delete merged.page

    for (const [k, v] of Object.entries(merged)) { if (v) params.set(k, v) }
    router.push(`${pathname}?${params.toString()}`)
  }, [currentFilters, pathname, router])

  const hasFilters = Object.keys(currentFilters).some(
    k => k !== 'sort' && k !== 'page' && currentFilters[k]
  )

  return (
    <aside className="w-full lg:w-[220px] shrink-0 space-y-5">
      <div>
        <p className="text-xs text-gray-400">{filteredCount} of {totalCount} projects</p>
        {hasFilters && (
          <button onClick={() => router.push(pathname)} className="text-[11px] text-blue-600 hover:underline mt-1">
            Clear all filters
          </button>
        )}
      </div>

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

      <FilterSection title="Emirate" options={cities} activeValue={currentFilters.city}
        onSelect={v => update({ city: v === currentFilters.city ? null : v })} />

      {districts.length > 0 && (
        <FilterSection title="Area" options={districts} activeValue={currentFilters.area}
          onSelect={v => update({ area: v === currentFilters.area ? null : v })} />
      )}

      <FilterSection title="Developer" options={developers} activeValue={currentFilters.developer}
        onSelect={v => update({ developer: v === currentFilters.developer ? null : v })} />

      <FilterSection title="Handover" options={handoverStatuses} activeValue={currentFilters.status}
        onSelect={v => update({ status: v === currentFilters.status ? null : v })} />

      {unitTypes.length > 0 && (
        <FilterSection title="Unit type" options={unitTypes} activeValue={currentFilters.unit_type}
          onSelect={v => update({ unit_type: v === currentFilters.unit_type ? null : v })} />
      )}

      {scoreBuckets.length > 0 && (
        <ChipFilter
          title="Score"
          options={scoreBuckets}
          activeValue={currentFilters.minScore}
          colorFor={v =>
            v === '85' ? 'bg-green-100 text-green-700' :
            v === '70' ? 'bg-emerald-100 text-emerald-700' :
            v === '55' ? 'bg-amber-100 text-amber-700' :
                         'bg-red-100 text-red-600'
          }
          onSelect={v => update({ minScore: v === currentFilters.minScore ? null : v })}
        />
      )}

      {priceBuckets.length > 0 && (
        <ChipFilter
          title="Price (from)"
          options={priceBuckets}
          activeValue={currentFilters.price}
          colorFor={() => 'bg-blue-100 text-blue-700'}
          onSelect={v => update({ price: v === currentFilters.price ? null : v })}
        />
      )}

      {psfBuckets.length > 0 && (
        <ChipFilter
          title="PSF range"
          options={psfBuckets}
          activeValue={currentFilters.psf}
          colorFor={() => 'bg-blue-100 text-blue-700'}
          onSelect={v => update({ psf: v === currentFilters.psf ? null : v })}
        />
      )}

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

function ChipFilter({ title, options, activeValue, colorFor, onSelect }: {
  title: string
  options: FilterOption[]
  activeValue?: string
  colorFor: (value: string) => string
  onSelect: (v: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="flex gap-1 flex-wrap">
        {options.map(opt => {
          const active = activeValue === opt.value
          return (
            <button key={opt.value}
              onClick={() => onSelect(opt.value)}
              title={`${opt.count} matching`}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
                active ? colorFor(opt.value) + ' ring-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
              <span className="ml-1 opacity-60">{opt.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
