import { createServerClient } from '@/lib/supabase/server'
import { ProjectTable } from '@/components/project/ProjectTable'
import { FilterSidebar } from '@/components/project/FilterSidebar'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const PAGE_SIZE = 20

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

  // ─── Fetch ALL projects for filter counts ───
  const { data: allRaw } = await supabase
    .from('projects')
    .select('id, name, slug, area, status, handover_status, current_psf, launch_psf, score, sellthrough_pct, handover_delay_days, developer:developer_id(name, slug)')
    .in('status', ['active', 'pre_launch'])
  const allProjects = (allRaw ?? []) as any[]

  // ─── Compute dynamic filter options from data ───
  const cityMap: Record<string, Set<string>> = {}
  const areaCount: Record<string, number> = {}
  const devCount: Record<string, number> = {}
  const statusCount: Record<string, number> = {}

  for (const p of allProjects) {
    // Determine city from area
    const area = p.area || 'Unknown'
    let city = 'Other'
    const dubaiAreas = ['Business Bay','Downtown Dubai','Dubai Marina','Dubai Hills','Dubai Hills Estate','JVC','JLT','Creek Harbour','Dubai Creek Harbour (The Lagoons)','Dubai Harbour','Palm Jumeirah','Meydan','Arjan','Damac Hills','Sobha Hartland','Dubai South','Dubai South (Dubai World Central)','Expo City','Al Furjan','Motor City','Sports City','Arabian Ranches','Mohammed Bin Rashid City','Jumeirah Village Circle','Dubai Design District','Mina Rashid','The Valley','Nad Al Sheba','Bukadra','Dubai Land']
    const adAreas = ['Saadiyat Island','Yas Island','Al Reem Island','Al Raha Beach','Abu Dhabi','Ghantoot','Al Hudayriat Island','Al Maryah Island','Khalifa City']
    const rakAreas = ['Al Marjan Island','Ras Al Khaimah','Mina Al Arab','Al Hamra Village','RAK Central']
    if (dubaiAreas.includes(area)) city = 'Dubai'
    else if (adAreas.includes(area)) city = 'Abu Dhabi'
    else if (rakAreas.includes(area)) city = 'Ras Al Khaimah'

    if (!cityMap[city]) cityMap[city] = new Set()
    cityMap[city].add(area)
    areaCount[area] = (areaCount[area] || 0) + 1

    const dev = p.developer?.name || 'Unknown'
    devCount[dev] = (devCount[dev] || 0) + 1

    const hs = p.handover_status || 'unknown'
    statusCount[hs] = (statusCount[hs] || 0) + 1
  }

  const cities = Object.entries(cityMap)
    .map(([city, areas]) => ({ value: city, label: city, count: [...areas].reduce((s, a) => s + (areaCount[a] || 0), 0) }))
    .sort((a, b) => b.count - a.count)

  const selectedCity = searchParams.city
  const districts = selectedCity && cityMap[selectedCity]
    ? [...cityMap[selectedCity]]
        .map(a => ({ value: a, label: a, count: areaCount[a] || 0 }))
        .sort((a, b) => b.count - a.count)
    : []

  const developers = Object.entries(devCount)
    .map(([name, count]) => ({ value: name, label: name, count }))
    .sort((a, b) => b.count - a.count)

  const handoverStatuses = Object.entries(statusCount)
    .map(([status, count]) => ({
      value: status,
      label: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // ─── Build filtered query ───
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

  // Sort
  const sortParam = searchParams.sort ?? 'score'
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    score: { column: 'score', ascending: false },
    score_asc: { column: 'score', ascending: true },
    psf: { column: 'current_psf', ascending: false },
    psf_asc: { column: 'current_psf', ascending: true },
    sellthrough: { column: 'sellthrough_pct', ascending: false },
    name: { column: 'name', ascending: true },
    handover: { column: 'current_handover_date', ascending: true },
  }
  const sc = sortMap[sortParam] ?? sortMap.score
  query = query.order(sc.column, { ascending: sc.ascending })

  // City filter
  if (searchParams.city && !searchParams.area) {
    const areas = cityMap[searchParams.city]
    if (areas) query = query.in('area', [...areas])
  }
  // District
  if (searchParams.area) query = query.eq('area', searchParams.area)
  // Handover status
  if (searchParams.status) query = query.eq('handover_status', searchParams.status)
  // Search
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q}%`)
  // Score filter
  if (searchParams.minScore) {
    const min = parseInt(searchParams.minScore)
    if (min === 0) query = query.lt('score', 55)
    else query = query.gte('score', min)
  }
  // PSF range
  if (searchParams.psf) {
    const [lo, hi] = searchParams.psf.split('-').map(Number)
    if (lo >= 0) query = query.gte('current_psf', lo)
    if (hi && hi < 99999) query = query.lte('current_psf', hi)
  }
  // Developer (via post-filter since it's a joined field)

  // Free tier limit
  if (isFree) query = query.limit(20)

  const { data: projects } = await query
  let filtered = (projects ?? []) as any[]

  // Developer post-filter (can't filter on joined fields in supabase)
  if (searchParams.developer) {
    filtered = filtered.filter((p: any) => p.developer?.name === searchParams.developer)
  }

  // ─── Pagination ───
  const page = Math.max(1, parseInt(searchParams.page ?? '1'))
  const totalFiltered = filtered.length
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ─── Stats ───
  const avgScore = filtered.length ? Math.round(filtered.reduce((s: number, p: any) => s + (p.score || 0), 0) / filtered.length) : 0
  const withPsf = filtered.filter((p: any) => p.current_psf)
  const avgPsf = withPsf.length ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length) : 0

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-16">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Projects</h1>
            <p className="text-[13px] text-gray-400 mt-1">
              {totalFiltered} projects · Avg score {avgScore} · Avg PSF AED {avgPsf.toLocaleString()}
            </p>
          </div>
          {isFree && (
            <a href="/settings/billing" className="text-[13px] font-medium text-white bg-gray-900 px-4 py-2 rounded-full hover:bg-gray-800">
              Upgrade
            </a>
          )}
        </div>

        {/* Sidebar + Table layout */}
        <div className="flex gap-6">
          {/* Sidebar */}
          <FilterSidebar
            currentFilters={searchParams}
            cities={cities}
            districts={districts}
            developers={developers}
            handoverStatuses={handoverStatuses}
            scoreRange={{ min: 0, max: 100 }}
            psfRange={{ min: 0, max: 10000 }}
            totalCount={allProjects.length}
            filteredCount={totalFiltered}
          />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <ProjectTable
              projects={paginated}
              tier={tier}
              sort={searchParams.sort}
              currentFilters={searchParams}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-5">
                {page > 1 && (
                  <PaginationLink page={page - 1} filters={searchParams} label="Prev" />
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <PaginationLink key={p} page={p} filters={searchParams} label={String(p)} isActive={p === page} />
                ))}
                {page < totalPages && (
                  <PaginationLink page={page + 1} filters={searchParams} label="Next" />
                )}
              </div>
            )}

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

function PaginationLink({ page, filters, label, isActive }: {
  page: number; filters: Record<string, string | undefined>; label: string; isActive?: boolean
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) { if (v && k !== 'page') params.set(k, v) }
  if (page > 1) params.set('page', String(page))

  return (
    <Link href={`/dashboard?${params.toString()}`}
      className={`text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
        isActive
          ? 'bg-gray-900 text-white'
          : 'text-gray-500 hover:bg-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
