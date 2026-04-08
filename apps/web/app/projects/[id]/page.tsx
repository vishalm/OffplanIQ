import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PsfChart } from '@/components/charts/PsfChart'
import { IrrCalculator } from '@/components/project/IrrCalculator'
import { DeveloperCard } from '@/components/project/DeveloperCard'
import { ScoreBadge } from '@/components/project/ScoreBadge'
import { WatchlistButton } from '@/components/project/WatchlistButton'
import { PaywallBanner } from '@/components/ui/PaywallBanner'
import { InvestmentAnalysis } from '@/components/project/InvestmentAnalysis'
import { InvestmentGauge } from '@/components/charts/InvestmentGauge'
import { RiskRewardMatrix } from '@/components/charts/RiskRewardMatrix'

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('subscription_tier').eq('id', session.user.id).single()
  const isPaid = (profile as any)?.subscription_tier !== 'free'

  let { data: project } = await supabase.from('projects')
    .select('*, developer:developer_id(*), payment_plans(*), psf_history(recorded_date, psf, source)')
    .eq('slug', params.id).single()
  if (!project) {
    const { data: byId } = await supabase.from('projects')
      .select('*, developer:developer_id(*), payment_plans(*), psf_history(recorded_date, psf, source)')
      .eq('id', params.id).single()
    project = byId
  }
  const p = project as any
  if (!p) notFound()

  const { data: watchlistEntry } = await supabase.from('watchlist')
    .select('id').eq('user_id', session.user.id).eq('project_id', p.id).single()

  const { data: allProjects } = await supabase.from('projects')
    .select('id, name, slug, area, score, current_psf, launch_psf, sellthrough_pct, handover_status, handover_delay_days, developer:developer_id(name)')
    .in('status', ['active', 'pre_launch']).order('score', { ascending: false })

  const psfDelta = p.launch_psf && p.current_psf
    ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null

  const breakdown = p.score_breakdown

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-6">
          <a href="/analytics" className="hover:text-gray-600 transition-colors">Analytics</a>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          <a href="/search" className="hover:text-gray-600 transition-colors">Search</a>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          <span className="text-gray-700 font-medium truncate max-w-[200px]">{p.name}</span>
        </div>

        {/* Hero row: Name left, Gauge right */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                p.handover_status === 'on_track' ? 'bg-green-100 text-green-700' :
                p.handover_status === 'delayed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>{(p.handover_status || '').replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
              {p.status === 'pre_launch' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Pre-launch</span>}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{p.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">by {p.developer?.name} · {p.area}</p>
            <div className="mt-3">
              <WatchlistButton projectId={p.id} userId={session.user.id} isWatchlisted={!!watchlistEntry} />
            </div>
          </div>
          <InvestmentGauge score={p.score} size={140} />
        </div>

        {/* 2x2 Gadget tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* Tile 1: Price & Growth */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Price</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">AED {(p.current_psf ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">per sqft</p>
              </div>
              {psfDelta !== null && (
                <div className={`text-right ${psfDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  <p className="text-2xl font-bold tabular-nums">{psfDelta > 0 ? '+' : ''}{psfDelta}%</p>
                  <p className="text-xs opacity-70">since launch</p>
                </div>
              )}
            </div>
            <div className="mt-4 h-px bg-gray-100" />
            <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
              <span>Launch: AED {(p.launch_psf ?? 0).toLocaleString()}/sqft</span>
              <span>Min: {p.min_price ? `AED ${(p.min_price / 1000000).toFixed(1)}M` : '-'}</span>
              <span>Max: {p.max_price ? `AED ${(p.max_price / 1000000).toFixed(1)}M` : '-'}</span>
            </div>
          </div>

          {/* Tile 2: Demand */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Demand</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{p.sellthrough_pct}%</p>
                <p className="text-xs text-gray-400 mt-0.5">sold</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-700 tabular-nums">{p.units_sold}<span className="text-gray-400 font-normal">/{p.total_units}</span></p>
                <p className="text-xs text-gray-400">units</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${p.sellthrough_pct >= 80 ? 'bg-green-500' : p.sellthrough_pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(p.sellthrough_pct, 100)}%` }} />
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
              <span>Resale premium: {p.resale_premium_pct > 0 ? '+' : ''}{p.resale_premium_pct}%</span>
              {p.total_floors && <span>{p.total_floors} floors</span>}
            </div>
          </div>

          {/* Tile 3: Score Breakdown */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Score Breakdown</p>
              <ScoreBadge score={p.score} size="sm" breakdown={breakdown} />
            </div>
            {breakdown && (
              <div className="space-y-2.5">
                {[
                  { label: 'Sell-through', score: breakdown.sellthrough, max: 40, color: 'bg-blue-500' },
                  { label: 'PSF momentum', score: breakdown.psf_delta, max: 30, color: 'bg-purple-500' },
                  { label: 'Developer', score: breakdown.developer, max: 20, color: 'bg-teal-500' },
                  { label: 'Handover', score: breakdown.handover, max: 10, color: 'bg-amber-500' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{item.score}/{item.max}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.score / item.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tile 4: PSF Chart */}
          <div className="card p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">PSF History</p>
            <PsfChart data={p.psf_history ?? []} />
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
              <span>Handover: {p.current_handover_date ? new Date(p.current_handover_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' }) : '-'}</span>
              {p.handover_delay_days > 0 && <span className="text-red-500 font-medium">{Math.round(p.handover_delay_days / 30)}mo delayed</span>}
              {p.handover_delay_days === 0 && <span className="text-green-600 font-medium">On schedule</span>}
            </div>
          </div>
        </div>

        {/* Investment Signals */}
        <InvestmentAnalysis project={p} allProjects={allProjects ?? []} />

        {/* Risk vs Reward */}
        <RiskRewardMatrix projects={allProjects ?? []} currentSlug={p.slug} />

        {/* IRR Calculator */}
        {isPaid ? (
          <IrrCalculator project={p} paymentPlans={p.payment_plans ?? []} />
        ) : (
          <PaywallBanner title="Payment plan IRR calculator" description="Compare payment plan returns side by side. Upgrade to Investor." />
        )}

        {/* Developer */}
        {isPaid ? (
          <DeveloperCard developer={p.developer} />
        ) : (
          <PaywallBanner title="Developer scorecard" description="On-time delivery rate, RERA complaints, historical ROI. All scored." />
        )}

        {/* Data sources */}
        <div className="mt-8 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-6 text-[11px] text-gray-400">
            <span>Sources: Property Finder, DLD, Developer Filings, RERA</span>
            <span>·</span>
            <span>Algorithmic analysis. Not financial advice.</span>
            <span>·</span>
            <span>Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>

      </div>
    </div>
  )
}
