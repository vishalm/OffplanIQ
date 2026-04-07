import { createServerClient } from '@/lib/supabase/server'
import { ProjectTable } from '@/components/project/ProjectTable'
import { MarketMetrics } from '@/components/project/MarketMetrics'
import { MarketInsights } from '@/components/project/MarketInsights'
import { AreaHeatMap } from '@/components/charts/AreaHeatMap'
import { FilterBar } from '@/components/project/FilterBar'
import { redirect } from 'next/navigation'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { city?: string; area?: string; status?: string; sort?: string; q?: string }
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', session.user.id)
    .single()

  const tier = (profile as any)?.subscription_tier ?? 'free'
  const isFree = tier === 'free'

  let query = supabase
    .from('projects')
    .select(`
      id, name, slug, area, status, handover_status,
      total_units, units_sold, sellthrough_pct,
      launch_psf, current_psf, score, score_breakdown,
      current_handover_date, handover_delay_days,
      developer:developer_id(name, slug, developer_score)
    `)
    .in('status', ['active', 'pre_launch'])

  const sortParam = searchParams.sort ?? 'score'
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    score: { column: 'score', ascending: false },
    psf: { column: 'current_psf', ascending: false },
    psf_asc: { column: 'current_psf', ascending: true },
    sellthrough: { column: 'sellthrough_pct', ascending: false },
    sellthrough_asc: { column: 'sellthrough_pct', ascending: true },
    name: { column: 'name', ascending: true },
    area: { column: 'area', ascending: true },
    handover: { column: 'current_handover_date', ascending: true },
    score_asc: { column: 'score', ascending: true },
  }
  const sortConfig = sortMap[sortParam] ?? sortMap.score
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending })

  const cityDistricts: Record<string, string[]> = {
    'Dubai': ['Business Bay','Downtown Dubai','Dubai Marina','Dubai Hills','Dubai Hills Estate','JVC','JLT','Creek Harbour','Dubai Creek Harbour (The Lagoons)','Dubai Harbour','Palm Jumeirah','Meydan','Arjan','Damac Hills','Sobha Hartland','Dubai South','Dubai South (Dubai World Central)','Expo City','Al Furjan','Motor City','Sports City','Arabian Ranches','Mohammed Bin Rashid City','Jumeirah Village Circle','Dubai Design District','Mina Rashid','The Valley','Nad Al Sheba','Bukadra','Dubai Land'],
    'Abu Dhabi': ['Saadiyat Island','Yas Island','Al Reem Island','Al Raha Beach','Abu Dhabi','Ghantoot','Al Hudayriat Island','Al Maryah Island','Khalifa City'],
    'Ras Al Khaimah': ['Al Marjan Island','Ras Al Khaimah','Mina Al Arab','Al Hamra Village','RAK Central'],
  }
  if (searchParams.city && !searchParams.area) {
    const districts = cityDistricts[searchParams.city]
    if (districts) query = query.in('area', districts)
  }
  if (searchParams.area) query = query.eq('area', searchParams.area)
  if (searchParams.status) query = query.eq('handover_status', searchParams.status)
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q}%`)
  if (isFree) query = query.limit(20)

  const { data: projects } = await query
  const { data: marketData } = await supabase.rpc('get_market_summary')

  return (
    <div className="min-h-screen" style={{ background: 'rgb(var(--bg))' }}>
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="section-label mb-2">Market overview</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Off-plan tracker
            </h1>
            <p className="text-sm text-gray-400 mt-2">
              {projects?.length ?? 0} projects across UAE · Live data
            </p>
          </div>
          {isFree && (
            <a
              href="/settings/billing"
              className="text-sm font-medium text-white bg-gray-900 px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              Upgrade for full access
            </a>
          )}
        </div>

        {/* Metrics */}
        <MarketMetrics data={marketData} />

        {/* Intelligence + Heat Map side by side */}
        <div className="grid grid-cols-[1fr_380px] gap-5 mb-8">
          <MarketInsights projects={projects ?? []} />
          <AreaHeatMap projects={projects ?? []} />
        </div>

        {/* Filters */}
        <FilterBar currentFilters={searchParams} />

        {/* Table */}
        <ProjectTable
          projects={projects ?? []}
          tier={tier}
          sort={searchParams.sort}
          currentFilters={searchParams}
        />

        {isFree && (
          <div className="mt-8 card p-5 text-center">
            <p className="text-sm text-gray-500">
              Viewing top 20 projects on the free plan.
            </p>
            <a href="/settings/billing" className="text-sm font-medium text-blue-600 hover:text-blue-700 mt-1 inline-block">
              Unlock all projects and live data →
            </a>
          </div>
        )}

      </div>
    </div>
  )
}
