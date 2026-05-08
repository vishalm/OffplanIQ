import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AnalyticsCharts } from './charts'
import { TimelineDrilldown } from './timeline'
import { MoreCharts } from './more-charts'
import { emirateForArea, EMIRATES } from '@/lib/uae-geo'

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
  // Only compute aggregates that can be substantiated from real data we
  // actually ingest: project count, DLD-matched sales, score, current_psf.
  // We deliberately don't surface Total Units / Est. Market Value because
  // total_units is unsourced today (no RERA, no working DLD project endpoint).
  const totalProjects = all.length
  const totalSold = all.reduce((s, p) => s + (p.units_sold || 0), 0)
  const avgScore = totalProjects ? Math.round(all.reduce((s, p) => s + (p.score || 0), 0) / totalProjects) : 0

  const withPsf = all.filter(p => p.current_psf > 0)
  const avgPsf = withPsf.length ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length) : 0

  // ─── Per-emirate breakdown (all 7 emirates always rendered) ───
  // Each emirate gets a tile even when count=0 so buyers can see geographic
  // coverage at a glance — empty tiles say "No projects yet" rather than
  // hiding the absence.
  type EmirateAgg = {
    count: number
    avgScore: number
    avgPsf: number
    totalSold: number
    psfSamples: number
    scoreSamples: number
  }
  const cityData: Record<string, EmirateAgg> = {}
  for (const e of EMIRATES) {
    cityData[e] = { count: 0, avgScore: 0, avgPsf: 0, totalSold: 0, psfSamples: 0, scoreSamples: 0 }
  }
  for (const p of all) {
    const city = emirateForArea(p.area || 'Unknown')
    const bucket = cityData[city] || cityData['Other'] || (cityData[city] = { count: 0, avgScore: 0, avgPsf: 0, totalSold: 0, psfSamples: 0, scoreSamples: 0 })
    bucket.count++
    bucket.totalSold += p.units_sold || 0
    if (p.score != null) { bucket.avgScore += p.score; bucket.scoreSamples++ }
    if (p.current_psf)   { bucket.avgPsf  += p.current_psf; bucket.psfSamples++ }
  }
  for (const c of Object.values(cityData)) {
    c.avgScore = c.scoreSamples ? Math.round(c.avgScore / c.scoreSamples) : 0
    c.avgPsf   = c.psfSamples   ? Math.round(c.avgPsf   / c.psfSamples)   : 0
  }
  const emirateRows = EMIRATES.map(name => ({ city: name, ...cityData[name] }))

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

  // Developer rankings — only fields we substantiate (curated tier score +
  // real project count). on_time_delivery_pct and rera_complaints_count are
  // intentionally omitted; we don't have a source we trust.
  const devRanking = devs
    .filter(d => d.developer_score != null)
    .map(d => ({
      name: d.name,
      slug: d.slug,
      score: d.developer_score,
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

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr] mb-6">
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Market signals</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-950">Top signal dashboard</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Projects tracked', value: totalProjects.toLocaleString() },
                    { label: 'Avg PSF', value: `AED ${avgPsf.toLocaleString()}` },
                    { label: 'DLD sales', value: totalSold.toLocaleString() },
                    { label: 'Avg score', value: `${avgScore}/100` },
                  ].map(item => (
                    <div key={item.label} className="rounded-3xl bg-slate-50 p-4 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-3 text-xl font-semibold text-slate-950 tabular-nums">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal highlight</p>
                  <p className="mt-2 text-sm text-slate-700">AI matches each project against live DLD price signals, developer momentum, and handover risk.</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why AI?</p>
                  <p className="mt-2 text-sm text-slate-700">It blends partial datasets, hides weak signals, and surfaces only explainable insights.</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Action focus</p>
                  <p className="mt-2 text-sm text-slate-700">Designed to deliver the most actionable property signals first.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <AnalyticsCharts scoreBuckets={scoreBuckets} psfByArea={psfByArea} cityData={emirateRows} />
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Timing & coverage</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Handover and reach</h2>
                </div>
                <span className="text-sm text-slate-500">Updated from current handover dates and emirate coverage.</span>
              </div>
              <div className="mt-5">
                <TimelineDrilldown timeline={timeline} launchTimeline={launchTimeline} />
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 mb-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Developer & pricing signals</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">Investment inputs</h3>
              </div>
              <span className="text-sm text-slate-500">Signal-rich metrics</span>
            </div>
            <div className="mt-5">
              <MoreCharts devData={devRanking.slice(0, 12)} sellthroughData={[
                { range: '20+ sold', count: all.filter(p => (p.units_sold || 0) >= 20).length },
                { range: '10-19', count: all.filter(p => (p.units_sold || 0) >= 10 && (p.units_sold || 0) < 20).length },
                { range: '5-9', count: all.filter(p => (p.units_sold || 0) >= 5 && (p.units_sold || 0) < 10).length },
                { range: '1-4', count: all.filter(p => (p.units_sold || 0) >= 1 && (p.units_sold || 0) < 5).length },
                { range: 'No sales', count: all.filter(p => (p.units_sold || 0) === 0).length },
              ]} priceData={[
                { range: '200k-500k', count: all.filter(p => p.min_price >= 200_000 && p.min_price < 500_000).length },
                { range: '500k-1M', count: all.filter(p => p.min_price >= 500_000 && p.min_price < 1_000_000).length },
                { range: '1M-1.5M', count: all.filter(p => p.min_price >= 1_000_000 && p.min_price < 1_500_000).length },
                { range: '1.5M+', count: all.filter(p => p.min_price >= 1_500_000).length },
              ]} handoverHealth={{
                onTrack: all.filter(p => p.current_handover_date && p.handover_delay_days <= 0).length,
                atRisk: all.filter(p => p.current_handover_date && p.handover_delay_days > 0 && p.handover_delay_days <= 90).length,
                delayed: delayedProjects.length,
              }} />
            </div>
          </div>

          <div className="grid gap-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Latest market alerts</p>
              <div className="mt-5 grid gap-4">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-green-600">Near Sellout</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{nearSellout.length}</p>
                  <p className="mt-2 text-sm text-slate-600">High-velocity projects investors should monitor closely.</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Recent Launches</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{recentLaunches.length}</p>
                  <p className="mt-2 text-sm text-slate-600">New supply entering the market and available for selection.</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">Significant Delays</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{delayedProjects.length}</p>
                  <p className="mt-2 text-sm text-slate-600">Projects at risk of delivery slip that affect timing.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Headline numbers — only metrics we can substantiate from real data.
            We hid: Total Units (no inventory source), Est. Market Value
            (depends on Total Units), absorption % (same divisor problem).
            Each tile carries a `provenance` blurb that explains where the
            number came from (rendered as both an info icon and a hover
            tooltip — buyers will ask). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            {
              label: 'Total Projects',
              value: totalProjects.toLocaleString(),
              color: 'text-gray-900',
              provenance: 'Unique rows in the projects table. Sourced primarily from Property Finder /new-projects landing pages (per-emirate scrape via Playwright); enriched with developer metadata from the curated UAE master DB.',
            },
            {
              label: 'DLD Sales Tracked',
              value: totalSold.toLocaleString(),
              color: 'text-blue-600',
              provenance: 'Sum of units_sold across projects. units_sold per project = count of off-plan sale transactions in the dld_transactions table (transaction_type=\'sales\', is_off_plan=true) that the matcher linked to this project. Source: Dubai Land Department open-data API.',
            },
            {
              label: 'Avg Score',
              value: `${avgScore}`,
              sub: '/100',
              color: avgScore >= 70 ? 'text-green-600' : 'text-amber-600',
              provenance: 'Mean of project.score across all projects. Each project score = 35×sellthrough + 20×psf-momentum + 30×developer-tier + 15×handover-proximity (max 100). Weights and buckets in supabase/functions/score-recalculator.',
            },
            {
              label: 'Avg PSF',
              value: `AED ${avgPsf.toLocaleString()}`,
              color: 'text-gray-900',
              provenance: 'Mean of project.current_psf across projects with a populated value. current_psf is rolling-180-day median PSF from DLD-matched transactions, computed by the psf-updater edge function.',
            },
          ].map(m => (
            <div key={m.label} className="card p-4 group relative" title={m.provenance}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{m.label}</p>
                <svg
                  className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  aria-label="How is this calculated?"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1" />
                </svg>
              </div>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${m.color}`}>
                {m.value}{m.sub && <span className="text-sm font-normal text-gray-400">{m.sub}</span>}
              </p>
              {/* On-hover popover — fixed-width, readable, never wraps oddly. */}
              <div className="hidden group-hover:block absolute z-20 top-full left-0 mt-2 w-72 p-3 rounded-lg bg-gray-900 text-white text-[11px] leading-relaxed shadow-xl">
                {m.provenance}
              </div>
            </div>
          ))}
        </div>

        {/* All 7 Emirates — coverage tile per emirate. Empty tiles surface
            "no projects yet" instead of being hidden, so buyers can see
            geographic gaps explicitly. Coverage today is Dubai-heavy because
            DLD's open-data gateway is Dubai-only; ADM/Sharjah RP/etc. tiles
            stay light until we add an emirate-specific data source. */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">UAE Emirates Coverage</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {emirateRows.map(e => {
              const has = e.count > 0
              return (
                <a
                  key={e.city}
                  href={`/search?city=${encodeURIComponent(e.city)}`}
                  className={`block rounded-xl border p-4 transition ${
                    has
                      ? 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-sm'
                      : 'bg-gray-50 border-dashed border-gray-200 hover:bg-white'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 truncate">{e.city}</p>
                  <p className={`text-2xl font-bold tabular-nums mt-0.5 ${has ? 'text-gray-900' : 'text-gray-300'}`}>
                    {e.count}
                  </p>
                  {has ? (
                    <div className="mt-2 space-y-0.5 text-[11px] text-gray-500">
                      {e.avgPsf > 0 && <p>Avg PSF: <span className="text-gray-900 font-medium">AED {e.avgPsf.toLocaleString()}</span></p>}
                      {e.avgScore > 0 && <p>Avg score: <span className="text-gray-900 font-medium">{e.avgScore}</span></p>}
                      {e.totalSold > 0 && <p>Sales tracked: <span className="text-gray-900 font-medium">{e.totalSold}</span></p>}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-400">No projects yet</p>
                  )}
                </a>
              )
            })}
          </div>
        </div>

        {/* Charts row */}
        <AnalyticsCharts
          scoreBuckets={scoreBuckets}
          psfByArea={psfByArea}
          cityData={emirateRows.filter(e => e.count > 0)}
        />

        {/* Developer + Top/Bottom */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">

          {/* Developer leaderboard */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Developer Rankings</p>
            <div className="space-y-2">
              {devRanking.slice(0, 10).map((dev, i) => (
                <div key={dev.slug} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i < 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{dev.name}</p>
                    <p className="text-[11px] text-gray-400">{dev.projects} {dev.projects === 1 ? 'project' : 'projects'}</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        {/* More visual charts */}
        <MoreCharts
          devData={devRanking.slice(0, 8).map(d => ({ name: d.name.length > 12 ? d.name.slice(0, 10) + '..' : d.name, score: d.score }))}
          sellthroughData={(() => {
            // Prefer real sellthrough_pct buckets when at least 5% of projects
            // have a non-zero pct (i.e. total_units is populated). Otherwise
            // fall back to DLD-matched units_sold count buckets — the chart
            // still represents the same idea (sales velocity), grounded in
            // real transactions instead of a divisor we don't always have.
            const withPct = all.filter((p: any) => (p.sellthrough_pct || 0) > 0).length
            if (withPct / Math.max(1, all.length) >= 0.05) {
              return [
                { range: '90-100%', count: all.filter((p: any) => p.sellthrough_pct >= 90).length },
                { range: '70-89%',  count: all.filter((p: any) => p.sellthrough_pct >= 70 && p.sellthrough_pct < 90).length },
                { range: '50-69%',  count: all.filter((p: any) => p.sellthrough_pct >= 50 && p.sellthrough_pct < 70).length },
                { range: '30-49%',  count: all.filter((p: any) => p.sellthrough_pct >= 30 && p.sellthrough_pct < 50).length },
                { range: '<30%',    count: all.filter((p: any) => p.sellthrough_pct < 30).length },
              ]
            }
            return [
              { range: '20+ sold',  count: all.filter((p: any) => (p.units_sold || 0) >= 20).length },
              { range: '10-19',     count: all.filter((p: any) => (p.units_sold || 0) >= 10 && (p.units_sold || 0) < 20).length },
              { range: '5-9',       count: all.filter((p: any) => (p.units_sold || 0) >= 5  && (p.units_sold || 0) < 10).length },
              { range: '1-4',       count: all.filter((p: any) => (p.units_sold || 0) >= 1  && (p.units_sold || 0) < 5).length },
              { range: 'No sales',  count: all.filter((p: any) => (p.units_sold || 0) === 0).length },
            ]
          })()}
          priceData={[
            { range: '<1M', count: all.filter(p => (p.min_price || 0) < 1000000).length },
            { range: '1-2M', count: all.filter(p => (p.min_price || 0) >= 1000000 && (p.min_price || 0) < 2000000).length },
            { range: '2-5M', count: all.filter(p => (p.min_price || 0) >= 2000000 && (p.min_price || 0) < 5000000).length },
            { range: '5-10M', count: all.filter(p => (p.min_price || 0) >= 5000000 && (p.min_price || 0) < 10000000).length },
            { range: '10M+', count: all.filter(p => (p.min_price || 0) >= 10000000).length },
          ]}
          handoverHealth={(() => {
            // The scraper hard-defaults handover_status='on_track' (we have
            // no original_handover_date to compute true delays from), so we
            // re-derive the chart from current_handover_date proximity:
            //   * date in the past               → 'past_due'
            //   * within 12 months               → 'imminent'
            //   * 12-36 months out               → 'mid'
            //   * 36+ months                     → 'distant'
            //   * date missing                   → 'unknown'
            const now = Date.now()
            const M = 1000 * 60 * 60 * 24 * 30
            const counts = { onTrack: 0, atRisk: 0, delayed: 0 }   // map to existing chart
            for (const p of all) {
              if (!p.current_handover_date) continue
              const monthsOut = (new Date(p.current_handover_date).getTime() - now) / M
              if (monthsOut < 0)        counts.delayed++
              else if (monthsOut <= 12) counts.atRisk++           // imminent → label "At Risk"
              else                      counts.onTrack++
            }
            return counts
          })()}
        />

        {/* Handover timeline drilldown */}
        <TimelineDrilldown timeline={timeline} launchTimeline={launchTimeline} />

        <p className="text-[11px] text-gray-400 text-center mt-6">
          Data from Property Finder, DLD, developer filings, RERA. Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>

        {/* Chat is global via layout.tsx */}
      </div>
    </div>
  )
}
