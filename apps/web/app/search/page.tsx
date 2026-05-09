import { createServerClient } from '@/lib/supabase/server'
import { ProjectTable } from '@/components/project/ProjectTable'
import { FilterSidebar } from '@/components/project/FilterSidebar'
import { SmartSearchBar } from '@/components/project/SmartSearchBar'
import { redirect } from 'next/navigation'
import { emirateForArea } from '@/lib/uae-geo'
import { disableUiComponentsDueToLackOfData } from '@/lib/featureFlags'
import {
  ActiveFilters,
  applyFilters,
  disjunctiveFacet,
  disjunctiveRangeFacet,
} from '@/lib/facets'

const formatAed = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${Math.round(n / 1_000)}K` :
  String(n)

const formatPsf = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n))

// Source of city for a row — prefer the column the scraper writes; fall back
// to the area-based mapping for any row that predates the city column.
const resolveCity = (p: any): string =>
  p.city || emirateForArea(p.area)

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('subscription_tier').eq('id', session.user.id).single()
  const tier = (profile as any)?.subscription_tier ?? 'free'
  const isFree = tier === 'free'

  // Fetch every active project once. Filters and facets all run over this set
  // in memory — payloads are small (hundreds, not millions) and this keeps
  // the facet logic identical to the table-row logic.
  const { data: allRaw } = await supabase
    .from('projects')
    .select(
      'id, name, slug, area, city, status, handover_status, unit_types, ' +
      'total_units, units_sold, sellthrough_pct, launch_psf, current_psf, ' +
      'min_price, max_price, score, score_breakdown, ' +
      'current_handover_date, handover_delay_days, ' +
      'developer:developer_id(name, slug, developer_score)',
    )
    .in('status', ['active', 'pre_launch'])
  const allProjects = (allRaw ?? []) as any[]

  // Parse URL → typed filter state.
  const active: ActiveFilters = {
    city:      searchParams.city,
    area:      searchParams.area,
    developer: searchParams.developer,
    status:    searchParams.status,
    unit_type: searchParams.unit_type,
    price:     searchParams.price,
    psf:       searchParams.psf,
    minScore:  searchParams.minScore,
    q:         searchParams.q,
  }

  // Build every facet from the data. Each is "disjunctive" — counts reflect
  // every OTHER active filter, so picking "Dubai" doesn't zero out city.
  const cities = disjunctiveFacet(allProjects, active, 'city',
    resolveCity, p => resolveCity(p))

  const areas = active.city
    ? disjunctiveFacet(allProjects, active, 'area',
        resolveCity, p => p.area)
    : []

  const developers = disjunctiveFacet(allProjects, active, 'developer',
    resolveCity, p => p.developer?.name)

  const handoverStatuses = disjunctiveFacet(allProjects, active, 'status',
    resolveCity, p => p.handover_status).map(o => ({
      ...o,
      label: o.value.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }))

  const unitTypes = disjunctiveFacet(allProjects, active, 'unit_type',
    resolveCity, p => p.unit_types, /* isArray */ true)

  const hidePsfComponents = disableUiComponentsDueToLackOfData

  const priceBuckets = disjunctiveRangeFacet(allProjects, active, 'price',
    resolveCity, p => p.min_price, n => `AED ${formatAed(n)}`)

  const psfBuckets = hidePsfComponents ? [] : disjunctiveRangeFacet(allProjects, active, 'psf',
    resolveCity, p => p.current_psf, n => `${formatPsf(n)}/sqft`)

  // Score buckets stay as labelled bands ("Excellent" etc.) but only show
  // when there's data in them.
  const scoreBuckets = (() => {
    const noScoreFilter = { ...active }; delete noScoreFilter.minScore
    const filtered = applyFilters(allProjects, noScoreFilter, resolveCity)
    const counts = {
      '85': filtered.filter(p => p.score != null && p.score >= 85).length,
      '70': filtered.filter(p => p.score != null && p.score >= 70 && p.score < 85).length,
      '55': filtered.filter(p => p.score != null && p.score >= 55 && p.score < 70).length,
      '0':  filtered.filter(p => p.score != null && p.score < 55).length,
    }
    const labels: Record<string, string> = { '85': '85+', '70': '70+', '55': '55+', '0': '<55' }
    return Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([value, count]) => ({ value, label: labels[value], count }))
  })()

  // Apply every active filter to get the table rows.
  const filtered = applyFilters(allProjects, active, resolveCity)
  const totalFiltered = filtered.length

  const avgScore = totalFiltered
    ? Math.round(filtered.filter((p: any) => p.score != null)
        .reduce((s: number, p: any) => s + p.score, 0) /
        Math.max(1, filtered.filter((p: any) => p.score != null).length))
    : 0
  const withPsf = hidePsfComponents ? [] : filtered.filter((p: any) => p.current_psf)
  const avgPsf = withPsf.length
    ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length)
    : 0

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-16">
        <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-4">
          <a href="/analytics" className="hover:text-gray-600 transition-colors">Analytics</a>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-gray-700 font-medium">Search</span>
        </div>
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Search Projects</h1>
            <p className="text-[13px] text-gray-400 mt-1">
              {totalFiltered} results
              {avgScore ? ` · Avg score ${avgScore}` : ''}
              {!hidePsfComponents && avgPsf ? ` · Avg PSF AED ${avgPsf.toLocaleString()}` : ''}
            </p>
          </div>
          {isFree && (
            <a href="/settings/billing" className="text-[13px] font-medium text-white bg-gray-900 px-4 py-2 rounded-full hover:bg-gray-800">
              Upgrade
            </a>
          )}
        </div>

        <SmartSearchBar />

        <div className="flex flex-col lg:flex-row gap-6">
          <FilterSidebar
            currentFilters={searchParams}
            cities={cities}
            districts={areas}
            developers={developers}
            handoverStatuses={handoverStatuses}
            unitTypes={unitTypes}
            priceBuckets={priceBuckets}
            psfBuckets={psfBuckets}
            scoreBuckets={scoreBuckets}
            totalCount={allProjects.length}
            filteredCount={totalFiltered}
          />

          <div className="flex-1 min-w-0">
            <ProjectTable projects={filtered} tier={tier} hidePsfColumns={hidePsfComponents} />

            {isFree && (
              <div className="mt-5 text-center">
                <p className="text-[13px] text-gray-400">
                  Free plan limited to 20 projects.{' '}
                  <a href="/settings/billing" className="text-blue-600 font-medium hover:underline">Unlock all →</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
