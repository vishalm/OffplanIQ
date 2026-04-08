import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AnalyticsCharts } from './charts'
import { TimelineDrilldown } from './timeline'

export default async function AnalyticsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  // Fetch everything
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug, area, status, handover_status, total_units, units_sold, sellthrough_pct, launch_psf, current_psf, score, score_breakdown, min_price, max_price, handover_delay_days, current_handover_date, launch_date, developer:developer_id(name, slug, developer_score, on_time_delivery_pct, rera_complaints_count, completed_projects, active_projects)')
    .in('status', ['active', 'pre_launch'])

  const { data: developers } = await supabase
    .from('developers')
    .select('*')

  const all = (projects ?? []) as any[]
  const devs = (developers ?? []) as any[]

  // ─── Compute all analytics server-side ───
  const totalProjects = all.length
  const totalUnits = all.reduce((s, p) => s + (p.total_units || 0), 0)
  const totalSold = all.reduce((s, p) => s + (p.units_sold || 0), 0)
  const avgScore = totalProjects ? Math.round(all.reduce((s, p) => s + (p.score || 0), 0) / totalProjects) : 0

  const withPsf = all.filter(p => p.current_psf > 0)
  const avgPsf = withPsf.length ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length) : 0

  const totalValue = all.reduce((s, p) => s + ((p.min_price || 0) * (p.total_units || 0)), 0)

  // City breakdown
  const cityData: Record<string, { count: number; avgScore: number; avgPsf: number; totalUnits: number }> = {}
  for (const p of all) {
    const area = p.area || 'Unknown'
    let city = 'Other'
    if (['Business Bay','Downtown Dubai','Dubai Marina','Dubai Hills','Dubai Hills Estate','JVC','JLT','Creek Harbour','Dubai Creek Harbour (The Lagoons)','Dubai Harbour','Palm Jumeirah','Meydan','Arjan','Damac Hills','Sobha Hartland','Dubai South','Dubai South (Dubai World Central)','Expo City','Jumeirah Village Circle','Dubai Design District','Mina Rashid','The Valley','Nad Al Sheba','Bukadra','Dubai Land'].includes(area)) city = 'Dubai'
    else if (['Saadiyat Island','Yas Island','Al Reem Island','Al Raha Beach','Ghantoot','Al Hudayriat Island','Al Maryah Island','Khalifa City'].includes(area)) city = 'Abu Dhabi'
    else if (['Al Marjan Island','Ras Al Khaimah','Mina Al Arab','Al Hamra Village','RAK Central'].includes(area)) city = 'RAK'

    if (!cityData[city]) cityData[city] = { count: 0, avgScore: 0, avgPsf: 0, totalUnits: 0 }
    cityData[city].count++
    cityData[city].avgScore += p.score || 0
    cityData[city].avgPsf += p.current_psf || 0
    cityData[city].totalUnits += p.total_units || 0
  }
  for (const c of Object.values(cityData)) {
    c.avgScore = Math.round(c.avgScore / c.count)
    c.avgPsf = Math.round(c.avgPsf / c.count)
  }

  // Top areas by PSF
  const areaMap: Record<string, { psfSum: number; count: number; scoreSum: number }> = {}
  for (const p of withPsf) {
    const a = p.area || 'Unknown'
    if (!areaMap[a]) areaMap[a] = { psfSum: 0, count: 0, scoreSum: 0 }
    areaMap[a].psfSum += p.current_psf
    areaMap[a].count++
    areaMap[a].scoreSum += p.score || 0
  }
  const topAreas = Object.entries(areaMap)
    .map(([area, d]) => ({ area, avgPsf: Math.round(d.psfSum / d.count), avgScore: Math.round(d.scoreSum / d.count), count: d.count }))
    .sort((a, b) => b.avgPsf - a.avgPsf)
    .slice(0, 12)

  // Developer rankings
  const devRanking = devs
    .filter(d => d.developer_score != null)
    .map(d => ({
      name: d.name,
      slug: d.slug,
      score: d.developer_score,
      onTime: d.on_time_delivery_pct,
      complaints: d.rera_complaints_count,
      projects: d.active_projects + d.completed_projects,
    }))
    .sort((a, b) => b.score - a.score)

  // Score distribution
  const scoreBuckets = [
    { label: 'Excellent (85+)', min: 85, max: 100, color: '#16a34a' },
    { label: 'Good (70-84)', min: 70, max: 84, color: '#22c55e' },
    { label: 'Watch (55-69)', min: 55, max: 69, color: '#ca8a04' },
    { label: 'Caution (40-54)', min: 40, max: 54, color: '#ea580c' },
    { label: 'Avoid (<40)', min: 0, max: 39, color: '#dc2626' },
  ].map(b => ({ ...b, count: all.filter(p => p.score >= b.min && p.score <= b.max).length }))

  // Top 5 / Bottom 5
  const sorted = [...all].sort((a, b) => b.score - a.score)
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.slice(-5).reverse()

  // Handover timeline
  const handoverData = all
    .filter(p => p.current_handover_date)
    .map(p => ({ name: p.name, date: p.current_handover_date, delayed: p.handover_delay_days > 0, score: p.score }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // PSF by area for chart
  const psfByArea = topAreas.map(a => ({ name: a.area.length > 15 ? a.area.slice(0, 13) + '..' : a.area, psf: a.avgPsf, score: a.avgScore }))

  // Handover timeline: group by year + month
  const timelineData: Record<string, { year: string; months: Record<string, { projects: { name: string; slug: string; score: number; delayed: boolean; area: string; developer: string; units: number }[] }> }> = {}
  for (const p of all) {
    if (!p.current_handover_date) continue
    const d = new Date(p.current_handover_date)
    const yr = d.getFullYear().toString()
    const mo = d.toLocaleDateString('en-AE', { month: 'short' })
    if (!timelineData[yr]) timelineData[yr] = { year: yr, months: {} }
    if (!timelineData[yr].months[mo]) timelineData[yr].months[mo] = { projects: [] }
    timelineData[yr].months[mo].projects.push({
      name: p.name, slug: p.slug, score: p.score || 0,
      delayed: p.handover_delay_days > 0, area: p.area,
      developer: p.developer?.name || '', units: p.total_units || 0,
    })
  }
  const timeline = Object.entries(timelineData).sort(([a], [b]) => a.localeCompare(b))
    .map(([year, data]) => ({
      year,
      months: Object.entries(data.months).map(([month, mData]) => ({
        month,
        projects: mData.projects.sort((a, b) => b.score - a.score),
      })),
    }))

  // Launch timeline by quarter
  const launchByQ: Record<string, number> = {}
  for (const p of all) {
    if (!p.launch_date) continue
    const d = new Date(p.launch_date)
    const q = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
    launchByQ[q] = (launchByQ[q] || 0) + 1
  }
  const launchTimeline = Object.entries(launchByQ).sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, count]) => ({ quarter, count }))

  // Announcements
  const recentLaunches = [...all].filter(p => p.launch_date).sort((a, b) => b.launch_date.localeCompare(a.launch_date)).slice(0, 5)
  const delayedProjects = all.filter(p => p.handover_delay_days > 90).sort((a, b) => b.handover_delay_days - a.handover_delay_days)
  const nearSellout = all.filter(p => p.sellthrough_pct >= 85 && p.sellthrough_pct < 100).sort((a, b) => b.sellthrough_pct - a.sellthrough_pct)

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-16">

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Market Analytics</h1>
            <p className="text-[13px] text-gray-400 mt-1">UAE off-plan real estate intelligence</p>
          </div>
          <p className="text-[11px] text-gray-400">Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Announcements */}
        <div className="card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-[13px] font-semibold text-gray-900">Market Announcements</p>
          </div>
          <div className="grid grid-cols-3 gap-4">

            {/* Near sellout */}
            <div>
              <p className="text-[11px] font-semibold text-green-600 uppercase tracking-wider mb-2">Near Sellout ({nearSellout.length})</p>
              {nearSellout.length === 0 && <p className="text-[12px] text-gray-400">No projects near sellout</p>}
              {nearSellout.slice(0, 3).map(p => (
                <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                  <div>
                    <p className="text-[12px] font-medium text-gray-900">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.developer?.name}</p>
                  </div>
                  <span className="text-[12px] font-bold text-green-600 tabular-nums">{p.sellthrough_pct}%</span>
                </a>
              ))}
            </div>

            {/* Recent launches */}
            <div>
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider mb-2">Recent Launches</p>
              {recentLaunches.slice(0, 3).map(p => (
                <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                  <div>
                    <p className="text-[12px] font-medium text-gray-900">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.developer?.name} · {p.area}</p>
                  </div>
                  <span className="text-[11px] text-gray-400">{new Date(p.launch_date).toLocaleDateString('en-AE', { month: 'short', year: '2-digit' })}</span>
                </a>
              ))}
            </div>

            {/* Delayed */}
            <div>
              <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-2">Significant Delays ({delayedProjects.length})</p>
              {delayedProjects.length === 0 && <p className="text-[12px] text-gray-400">No significant delays</p>}
              {delayedProjects.slice(0, 3).map(p => (
                <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                  <div>
                    <p className="text-[12px] font-medium text-gray-900">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.developer?.name}</p>
                  </div>
                  <span className="text-[12px] font-bold text-red-500">+{Math.round(p.handover_delay_days / 30)}mo</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Big numbers */}
        <div className="grid grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Total Projects', value: totalProjects.toLocaleString(), color: 'text-gray-900' },
            { label: 'Total Units', value: totalUnits.toLocaleString(), color: 'text-gray-900' },
            { label: 'Units Sold', value: totalSold.toLocaleString(), sub: `${totalUnits ? Math.round((totalSold / totalUnits) * 100) : 0}% absorption`, color: 'text-blue-600' },
            { label: 'Avg Score', value: `${avgScore}`, sub: '/100', color: avgScore >= 70 ? 'text-green-600' : 'text-amber-600' },
            { label: 'Avg PSF', value: `AED ${avgPsf.toLocaleString()}`, color: 'text-gray-900' },
            { label: 'Est. Market Value', value: `AED ${(totalValue / 1e9).toFixed(1)}B`, color: 'text-purple-600' },
          ].map(m => (
            <div key={m.label} className="card p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{m.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${m.color}`}>{m.value}{m.sub && <span className="text-sm font-normal text-gray-400">{m.sub}</span>}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <AnalyticsCharts
          scoreBuckets={scoreBuckets}
          psfByArea={psfByArea}
          cityData={Object.entries(cityData).map(([city, d]) => ({ city, ...d }))}
        />

        {/* Developer + Top/Bottom */}
        <div className="grid grid-cols-3 gap-5 mb-6">

          {/* Developer leaderboard */}
          <div className="card p-5 col-span-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Developer Rankings</p>
            <div className="space-y-2">
              {devRanking.slice(0, 10).map((dev, i) => (
                <div key={dev.slug} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i < 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{dev.name}</p>
                    <p className="text-[11px] text-gray-400">{dev.projects} projects · {dev.onTime}% on-time</p>
                  </div>
                  <span className={`text-[13px] font-bold tabular-nums ${dev.score >= 85 ? 'text-green-600' : dev.score >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {dev.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 5 */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-green-600 uppercase tracking-wider mb-4">Top 5 Projects</p>
            <div className="space-y-2">
              {top5.map((p: any, i: number) => {
                const growth = p.launch_psf && p.current_psf ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null
                return (
                  <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400">{p.developer?.name} · {p.area}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-green-600 tabular-nums">{p.score}</p>
                      {growth !== null && <p className="text-[10px] text-green-500">+{growth}%</p>}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>

          {/* Bottom 5 */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-4">Bottom 5 Projects</p>
            <div className="space-y-2">
              {bottom5.map((p: any, i: number) => {
                const growth = p.launch_psf && p.current_psf ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null
                return (
                  <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">{totalProjects - 4 + i}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400">{p.developer?.name} · {p.area}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-red-500 tabular-nums">{p.score}</p>
                      {growth !== null && growth < 0 && <p className="text-[10px] text-red-400">{growth}%</p>}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        {/* Area PSF table */}
        <div className="card p-5 mb-6">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Area Comparison</p>
          <div className="grid grid-cols-4 gap-3">
            {topAreas.map((a, i) => {
              const barW = avgPsf > 0 ? Math.round((a.avgPsf / topAreas[0].avgPsf) * 100) : 0
              return (
                <div key={a.area} className="relative p-3 rounded-lg bg-gray-50">
                  <div className="absolute top-0 left-0 h-1 rounded-t-lg bg-gradient-to-r from-blue-400 to-blue-500" style={{ width: `${barW}%` }} />
                  <p className="text-[12px] font-semibold text-gray-900 truncate mt-1">{a.area}</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">AED {a.avgPsf.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400">{a.count} project{a.count > 1 ? 's' : ''} · Score {a.avgScore}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Handover timeline drilldown */}
        <TimelineDrilldown timeline={timeline} launchTimeline={launchTimeline} />

        <p className="text-[11px] text-gray-400 text-center mt-6">
          Data from Property Finder, DLD, developer filings, RERA. Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
  )
}
