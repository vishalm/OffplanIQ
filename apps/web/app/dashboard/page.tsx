// apps/web/app/dashboard/page.tsx
//
// SCREEN 1: Project Feed
// The main landing page after login.
// Server Component — data fetched server-side for SEO + speed.
//
// Layout:
//   - Market summary metrics (4 cards)
//   - Filter bar (area, status, score range)
//   - Sortable project table
//   - Each row links to /projects/[slug]
//
// Access control:
//   - Free users: see top 20 projects, PSF lagged 30 days
//   - Paid users: all projects, live data

import { createServerClient } from '@/lib/supabase/server'
import { ProjectTable } from '@/components/project/ProjectTable'
import { MarketMetrics } from '@/components/project/MarketMetrics'
import { FilterBar } from '@/components/project/FilterBar'
import { redirect } from 'next/navigation'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { area?: string; status?: string; sort?: string; q?: string }
}) {
  const supabase = createServerClient()

  // Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  // Get user subscription tier
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', session.user.id)
    .single()

  const tier = (profile as any)?.subscription_tier ?? 'free'
  const isFree = tier === 'free'

  // Build query
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

  // Apply sort from URL params
  const sortParam = searchParams.sort ?? 'score'
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    score:       { column: 'score', ascending: false },
    psf:         { column: 'current_psf', ascending: false },
    psf_asc:     { column: 'current_psf', ascending: true },
    sellthrough: { column: 'sellthrough_pct', ascending: false },
    sellthrough_asc: { column: 'sellthrough_pct', ascending: true },
    name:        { column: 'name', ascending: true },
    area:        { column: 'area', ascending: true },
    handover:    { column: 'current_handover_date', ascending: true },
    score_asc:   { column: 'score', ascending: true },
  }
  const sortConfig = sortMap[sortParam] ?? sortMap.score
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending })

  // Apply filters from searchParams
  if (searchParams.area) {
    query = query.eq('area', searchParams.area)
  }
  if (searchParams.status) {
    query = query.eq('handover_status', searchParams.status)
  }
  if (searchParams.q) {
    query = query.ilike('name', `%${searchParams.q}%`)
  }

  // Free tier: limit to top 20
  if (isFree) {
    query = query.limit(20)
  }

  const { data: projects, error } = await query

  if (error) {
    console.error('Dashboard query error:', error)
  }

  // Market summary
  const { data: marketData } = await supabase.rpc('get_market_summary')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium text-gray-900">Off-plan tracker</h1>
            <p className="text-sm text-gray-500 mt-1">
              Dubai · {projects?.length ?? 0} projects · updated hourly
            </p>
          </div>
          {isFree && (
            <a
              href="/settings/billing"
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
            >
              Upgrade for live data →
            </a>
          )}
        </div>

        <MarketMetrics data={marketData} />

        <FilterBar currentFilters={searchParams} />

        <ProjectTable
          projects={projects ?? []}
          tier={tier}
          sort={searchParams.sort}
          currentFilters={searchParams}
        />

        {isFree && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            Showing top 20 projects on the free plan.
            <a href="/settings/billing" className="underline ml-1">Upgrade to see all 142+ projects →</a>
          </div>
        )}

      </div>
    </div>
  )
}
