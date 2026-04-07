import { createServerClient } from '@/lib/supabase/server'
import { ProjectTable } from '@/components/project/ProjectTable'
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
    .from('user_profiles').select('subscription_tier').eq('id', session.user.id).single()
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
    handover: { column: 'current_handover_date', ascending: true },
    score_asc: { column: 'score', ascending: true },
  }
  query = query.order((sortMap[sortParam] ?? sortMap.score).column, { ascending: (sortMap[sortParam] ?? sortMap.score).ascending })

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
  const all = projects ?? []

  // Compute stats
  const withPsf = all.filter((p: any) => p.current_psf && p.launch_psf)
  const avgScore = all.length ? Math.round(all.reduce((s: number, p: any) => s + (p.score || 0), 0) / all.length) : 0
  const avgPsf = withPsf.length ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length) : 0
  const strongBuy = all.filter((p: any) => p.score >= 85 && p.sellthrough_pct >= 70).length
  const atRisk = all.filter((p: any) => p.score < 50 || (p.handover_delay_days > 180)).length

  // Top mover
  const topMover = withPsf
    .map((p: any) => ({ ...p, delta: Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) }))
    .sort((a: any, b: any) => b.delta - a.delta)[0]

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Projects</h1>
          <p className="text-[13px] text-gray-400 mt-1">{all.length} off-plan projects across UAE</p>
        </div>

        {/* Stats row: clean, minimal, one line */}
        <div className="flex items-center gap-8 mb-8 px-1">
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Avg Score</p>
            <p className="text-xl font-bold text-gray-900">{avgScore}<span className="text-sm font-normal text-gray-400">/100</span></p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Avg PSF</p>
            <p className="text-xl font-bold text-gray-900"><span className="text-sm font-normal text-gray-400">AED </span>{avgPsf.toLocaleString()}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-[11px] font-medium text-green-500 uppercase tracking-wider">Buy signals</p>
            <p className="text-xl font-bold text-green-600">{strongBuy}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-[11px] font-medium text-red-400 uppercase tracking-wider">Risk alerts</p>
            <p className="text-xl font-bold text-red-500">{atRisk}</p>
          </div>
          {topMover && (
            <>
              <div className="w-px h-8 bg-gray-200" />
              <a href={`/projects/${topMover.slug}`} className="group">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Top mover</p>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {topMover.name} <span className="text-green-600">+{topMover.delta}%</span>
                </p>
              </a>
            </>
          )}
        </div>

        {/* Filters */}
        <FilterBar currentFilters={searchParams} />

        {/* Table */}
        <ProjectTable
          projects={all}
          tier={tier}
          sort={searchParams.sort}
          currentFilters={searchParams}
        />

        {isFree && (
          <div className="mt-6 text-center py-4">
            <p className="text-sm text-gray-400">
              Showing top 20 on the free plan.{' '}
              <a href="/settings/billing" className="text-blue-600 font-medium hover:underline">Unlock all →</a>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
