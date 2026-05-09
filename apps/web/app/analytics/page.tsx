import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AnalyticsCharts } from './charts'
import { TimelineDrilldown } from './timeline'
import { MoreCharts } from './more-charts'
import { AIBriefing } from './briefing'
import { emirateForArea, EMIRATES } from '@/lib/uae-geo'

export default async function AnalyticsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug, area, status, handover_status, total_units, units_sold, sellthrough_pct, launch_psf, current_psf, score, score_breakdown, min_price, max_price, handover_delay_days, current_handover_date, launch_date, developer:developer_id(name, slug, developer_score, on_time_delivery_pct, rera_complaints_count, completed_projects, active_projects)')
    .in('status', ['active', 'pre_launch'])

  const { data: developers } = await supabase
    .from('developers')
    .select('*')

  const all = (projects ?? []) as any[]
  const devs = (developers ?? []) as any[]

  // ─── Headline KPIs (only metrics we can substantiate from real data) ───
  // Hidden on purpose: total_units (no inventory source), est. market value
  // (depends on units), absorption % (same divisor problem).
  const totalProjects = all.length
  const totalSold = all.reduce((s, p) => s + (p.units_sold || 0), 0)
  const avgScore = totalProjects ? Math.round(all.reduce((s, p) => s + (p.score || 0), 0) / totalProjects) : 0
  const withPsf = all.filter(p => p.current_psf > 0)
  const avgPsf = withPsf.length ? Math.round(withPsf.reduce((s: number, p: any) => s + p.current_psf, 0) / withPsf.length) : 0

  // ─── Per-emirate breakdown (all 7 always rendered) ───
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

  // Developer rankings
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

  // PSF by area for chart
  const psfByArea = topAreas.map(a => ({ name: a.area.length > 15 ? a.area.slice(0, 13) + '..' : a.area, psf: a.avgPsf, score: a.avgScore }))

  // Handover timeline grouped by year + month
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

  // Action signals
  const recentLaunches = [...all]
    .filter(p => p.launch_date)
    .sort((a, b) => b.launch_date.localeCompare(a.launch_date))
    .slice(0, 5)
  const delayedProjects = all
    .filter(p => p.handover_delay_days > 90)
    .sort((a, b) => b.handover_delay_days - a.handover_delay_days)
  const nearSellout = all
    .filter(p => p.sellthrough_pct >= 85 && p.sellthrough_pct < 100)
    .sort((a, b) => b.sellthrough_pct - a.sellthrough_pct)

  // ─── Single canonical bucket schemas (no schema drift) ───
  const sellthroughData = (() => {
    // Prefer real sellthrough_pct buckets when ≥5% of projects have a value;
    // otherwise fall back to DLD-matched units_sold counts.
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
      { range: '20+ sold', count: all.filter((p: any) => (p.units_sold || 0) >= 20).length },
      { range: '10-19',    count: all.filter((p: any) => (p.units_sold || 0) >= 10 && (p.units_sold || 0) < 20).length },
      { range: '5-9',      count: all.filter((p: any) => (p.units_sold || 0) >= 5  && (p.units_sold || 0) < 10).length },
      { range: '1-4',      count: all.filter((p: any) => (p.units_sold || 0) >= 1  && (p.units_sold || 0) < 5).length },
      { range: 'No sales', count: all.filter((p: any) => (p.units_sold || 0) === 0).length },
    ]
  })()

  const priceData = [
    { range: '<1M',   count: all.filter(p => (p.min_price || 0) < 1_000_000).length },
    { range: '1-2M',  count: all.filter(p => (p.min_price || 0) >= 1_000_000  && (p.min_price || 0) < 2_000_000).length },
    { range: '2-5M',  count: all.filter(p => (p.min_price || 0) >= 2_000_000  && (p.min_price || 0) < 5_000_000).length },
    { range: '5-10M', count: all.filter(p => (p.min_price || 0) >= 5_000_000  && (p.min_price || 0) < 10_000_000).length },
    { range: '10M+',  count: all.filter(p => (p.min_price || 0) >= 10_000_000).length },
  ]

  // Handover health: scraper hardcodes status='on_track', so derive from
  // current_handover_date proximity instead. Single computation, single chart.
  const handoverHealth = (() => {
    const now = Date.now()
    const M = 1000 * 60 * 60 * 24 * 30
    const counts = { onTrack: 0, atRisk: 0, delayed: 0 }
    for (const p of all) {
      if (!p.current_handover_date) continue
      const monthsOut = (new Date(p.current_handover_date).getTime() - now) / M
      if (monthsOut < 0)        counts.delayed++
      else if (monthsOut <= 12) counts.atRisk++
      else                      counts.onTrack++
    }
    return counts
  })()

  // ─── AI Briefing inputs ───
  const activeEmirates = emirateRows.filter(e => e.count > 0).length
  const leadEmirate = [...emirateRows]
    .filter(e => e.count >= 3 && e.avgScore > 0)
    .sort((a, b) => b.avgScore - a.avgScore)[0]
  const scoreLabel = avgScore >= 70 ? 'strong' : avgScore >= 55 ? 'mixed' : 'cautious'

  const narrativeParts: string[] = []
  narrativeParts.push(
    `Tracking ${totalProjects.toLocaleString()} active projects across ${activeEmirates} emirate${activeEmirates === 1 ? '' : 's'}. ` +
    `Average market score is ${avgScore}/100 — a ${scoreLabel} read.`
  )
  if (leadEmirate) {
    narrativeParts.push(
      `${leadEmirate.city} leads on quality with ${leadEmirate.count} projects` +
      (leadEmirate.avgPsf > 0 ? ` at AED ${leadEmirate.avgPsf.toLocaleString()}/sqft` : '') +
      ` and an average score of ${leadEmirate.avgScore}.`
    )
  }
  const focus: string[] = []
  if (nearSellout.length)      focus.push(`${nearSellout.length} near sellout`)
  if (delayedProjects.length)  focus.push(`${delayedProjects.length} significantly delayed`)
  if (recentLaunches.length)   focus.push(`${recentLaunches.length} fresh launch${recentLaunches.length === 1 ? '' : 'es'}`)
  if (focus.length) narrativeParts.push(`Focus today: ${focus.join(', ')}.`)
  const narrative = narrativeParts.join(' ')

  const kpis = [
    {
      label: 'Total Projects',
      value: totalProjects.toLocaleString(),
      provenance: 'Unique rows in the projects table. Sourced primarily from Property Finder /new-projects landing pages (per-emirate scrape via Playwright); enriched with developer metadata from the curated UAE master DB.',
    },
    {
      label: 'DLD Sales Tracked',
      value: totalSold.toLocaleString(),
      color: 'text-blue-600',
      provenance: "Sum of units_sold across projects. units_sold per project = count of off-plan sale transactions in the dld_transactions table (transaction_type='sales', is_off_plan=true) that the matcher linked to this project. Source: Dubai Land Department open-data API.",
    },
    {
      label: 'Avg Score',
      value: `${avgScore}`,
      sub: '/100',
      color: avgScore >= 70 ? 'text-emerald-600' : 'text-amber-600',
      provenance: 'Mean of project.score across all projects. Each project score = 35×sellthrough + 20×psf-momentum + 30×developer-tier + 15×handover-proximity (max 100). Weights and buckets in supabase/functions/score-recalculator.',
    },
    {
      label: 'Avg PSF',
      value: `AED ${avgPsf.toLocaleString()}`,
      provenance: 'Mean of project.current_psf across projects with a populated value. current_psf is rolling-180-day median PSF from DLD-matched transactions, computed by the psf-updater edge function.',
    },
  ]

  const signals = [
    nearSellout.length ? {
      tone: 'positive' as const,
      label: 'Near sellout',
      count: nearSellout.length,
      blurb: 'High-velocity projects above 85% sold.',
      top: { slug: nearSellout[0].slug, name: nearSellout[0].name, detail: `${Math.round(nearSellout[0].sellthrough_pct)}% sold` },
    } : null,
    recentLaunches.length ? {
      tone: 'info' as const,
      label: 'Fresh launches',
      count: recentLaunches.length,
      blurb: 'Newest supply entering the market.',
      top: { slug: recentLaunches[0].slug, name: recentLaunches[0].name, detail: new Date(recentLaunches[0].launch_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' }) },
    } : null,
    delayedProjects.length ? {
      tone: 'warn' as const,
      label: 'Significant delays',
      count: delayedProjects.length,
      blurb: 'Handover slipped >90 days vs schedule.',
      top: { slug: delayedProjects[0].slug, name: delayedProjects[0].name, detail: `${delayedProjects[0].handover_delay_days} days late` },
    } : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null)

  const asOf = new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 space-y-6">

        <AIBriefing narrative={narrative} kpis={kpis} signals={signals} asOf={asOf} />

        {/* Coverage map — all 7 emirates, empty tiles surface gaps explicitly */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">UAE Coverage</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Geographic reach</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {emirateRows.map(e => {
              const has = e.count > 0
              return (
                <a
                  key={e.city}
                  href={`/search?city=${encodeURIComponent(e.city)}`}
                  className={`block rounded-xl border p-4 transition ${
                    has
                      ? 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'
                      : 'border-dashed border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <p className="truncate text-[11px] uppercase tracking-wider text-slate-400">{e.city}</p>
                  <p className={`mt-0.5 text-2xl font-bold tabular-nums ${has ? 'text-slate-900' : 'text-slate-300'}`}>
                    {e.count}
                  </p>
                  {has ? (
                    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                      {e.avgPsf > 0 && <p>Avg PSF: <span className="font-medium text-slate-900">AED {e.avgPsf.toLocaleString()}</span></p>}
                      {e.avgScore > 0 && <p>Avg score: <span className="font-medium text-slate-900">{e.avgScore}</span></p>}
                      {e.totalSold > 0 && <p>Sales: <span className="font-medium text-slate-900">{e.totalSold.toLocaleString()}</span></p>}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">No projects yet</p>
                  )}
                </a>
              )
            })}
          </div>
        </section>

        {/* Score & price landscape */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Score & price landscape</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Where the market sits</h2>
          <div className="mt-5">
            <AnalyticsCharts
              scoreBuckets={scoreBuckets}
              psfByArea={psfByArea}
              cityData={emirateRows.filter(e => e.count > 0)}
            />
          </div>
        </section>

        {/* Velocity & risk */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Velocity & risk</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">How fast it&rsquo;s moving</h2>
          <div className="mt-5">
            <MoreCharts
              sellthroughData={sellthroughData}
              priceData={priceData}
              handoverHealth={handoverHealth}
            />
          </div>
        </section>

        {/* Timeline drill-down — handovers & launches */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Timeline</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Handovers and launches</h2>
          <div className="mt-5">
            <TimelineDrilldown timeline={timeline} launchTimeline={launchTimeline} />
          </div>
        </section>

        {/* Action lists */}
        <section className="grid gap-5 md:grid-cols-3">
          {/* Top 5 */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Top 5 Projects</p>
            <div className="space-y-2">
              {top5.map((p: any, i: number) => {
                const growth = p.launch_psf && p.current_psf ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null
                return (
                  <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-900">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.developer?.name} · {p.area}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums text-emerald-600">{p.score}</p>
                      {growth !== null && <p className="text-[10px] text-emerald-500">+{growth}%</p>}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>

          {/* Bottom 5 */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-red-500">Bottom 5 Projects</p>
            <div className="space-y-2">
              {bottom5.map((p: any, i: number) => {
                const growth = p.launch_psf && p.current_psf ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null
                return (
                  <a key={p.id} href={`/projects/${p.slug}`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">{Math.max(1, totalProjects - 4 + i)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-900">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.developer?.name} · {p.area}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums text-red-500">{p.score}</p>
                      {growth !== null && growth < 0 && <p className="text-[10px] text-red-400">{growth}%</p>}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>

          {/* Developer leaderboard */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Developer Rankings</p>
            <div className="space-y-2">
              {devRanking.slice(0, 10).map((dev, i) => (
                <div key={dev.slug} className="flex items-center gap-3 p-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-900">{dev.name}</p>
                    <p className="text-[11px] text-slate-400">{dev.projects} {dev.projects === 1 ? 'project' : 'projects'}</p>
                  </div>
                  <span className={`text-[13px] font-bold tabular-nums ${dev.score >= 85 ? 'text-emerald-600' : dev.score >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {dev.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Area comparison */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Area Comparison</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {topAreas.map(a => {
              const barW = topAreas[0]?.avgPsf > 0 ? Math.round((a.avgPsf / topAreas[0].avgPsf) * 100) : 0
              return (
                <div key={a.area} className="relative rounded-lg bg-slate-50 p-3">
                  <div className="absolute left-0 top-0 h-1 rounded-t-lg bg-gradient-to-r from-blue-400 to-blue-500" style={{ width: `${barW}%` }} />
                  <p className="mt-1 truncate text-[12px] font-semibold text-slate-900">{a.area}</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900">AED {a.avgPsf.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-400">{a.count} project{a.count > 1 ? 's' : ''} · Score {a.avgScore}</p>
                </div>
              )
            })}
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Data from Property Finder, DLD, developer filings, RERA. Updated {asOf}.
        </p>
      </div>
    </div>
  )
}
