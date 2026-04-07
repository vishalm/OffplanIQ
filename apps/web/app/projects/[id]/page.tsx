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

  let { data: project } = await supabase
    .from('projects')
    .select('*, developer:developer_id(*), payment_plans(*), psf_history(recorded_date, psf, source)')
    .eq('slug', params.id).single()
  if (!project) {
    const { data: byId } = await supabase
      .from('projects')
      .select('*, developer:developer_id(*), payment_plans(*), psf_history(recorded_date, psf, source)')
      .eq('id', params.id).single()
    project = byId
  }
  const p = project as any
  if (!p) notFound()

  const { data: watchlistEntry } = await supabase
    .from('watchlist').select('id').eq('user_id', session.user.id).eq('project_id', p.id).single()
  const isWatchlisted = !!watchlistEntry

  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, slug, area, score, current_psf, launch_psf, sellthrough_pct, handover_status, handover_delay_days, developer:developer_id(name)')
    .in('status', ['active', 'pre_launch'])
    .order('score', { ascending: false })

  const psfDelta = p.launch_psf && p.current_psf
    ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) : null

  return (
    <div className="min-h-screen" style={{ background: 'rgb(var(--bg))' }}>
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Breadcrumb */}
        <a href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-8">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to projects
        </a>

        {/* Hero */}
        <div className="card p-8 mb-6 fade-in">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  p.handover_status === 'on_track' ? 'bg-green-50 text-green-700' :
                  p.handover_status === 'delayed' ? 'bg-red-50 text-red-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {(p.handover_status || '').replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
                {p.status === 'pre_launch' && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">Pre-launch</span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">{p.name}</h1>

              <p className="text-base text-gray-500">
                by {p.developer?.name} · {p.area}
              </p>

              {p.description && (
                <p className="text-sm text-gray-400 mt-3 max-w-xl leading-relaxed">{p.description}</p>
              )}

              <div className="flex items-center gap-4 mt-5">
                <WatchlistButton projectId={p.id} userId={session.user.id} isWatchlisted={isWatchlisted} />
              </div>
            </div>

            {/* Gauge */}
            <div className="shrink-0">
              <InvestmentGauge score={p.score} size={200} />
            </div>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-5 gap-4 mb-6 stagger">
          {[
            {
              label: 'Current PSF',
              value: p.current_psf ? `AED ${p.current_psf.toLocaleString()}` : '-',
              sub: psfDelta !== null ? `${psfDelta > 0 ? '+' : ''}${psfDelta}% since launch` : undefined,
              accent: psfDelta !== null && psfDelta > 0,
            },
            {
              label: 'Launch PSF',
              value: p.launch_psf ? `AED ${p.launch_psf.toLocaleString()}` : '-',
              sub: p.launch_date ? new Date(p.launch_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' }) : undefined,
            },
            {
              label: 'Sell-through',
              value: `${p.sellthrough_pct}%`,
              sub: `${p.units_sold} of ${p.total_units} units`,
              accent: p.sellthrough_pct >= 70,
            },
            {
              label: 'Handover',
              value: p.current_handover_date ? new Date(p.current_handover_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' }) : '-',
              sub: p.handover_delay_days > 0 ? `${Math.round(p.handover_delay_days / 30)}mo delayed` : 'On schedule',
              danger: p.handover_delay_days > 0,
            },
            {
              label: 'Resale premium',
              value: `${p.resale_premium_pct > 0 ? '+' : ''}${p.resale_premium_pct}%`,
              sub: 'vs launch price',
              accent: p.resale_premium_pct > 0,
              danger: p.resale_premium_pct < 0,
            },
          ].map(stat => (
            <div key={stat.label} className="metric-card">
              <p className="metric-label">{stat.label}</p>
              <p className={`metric-value ${stat.accent ? '!text-green-600' : stat.danger ? '!text-red-500' : ''}`}>
                {stat.value}
              </p>
              {stat.sub && (
                <p className={`metric-sub ${stat.danger ? '!text-red-400' : stat.accent ? '!text-green-500' : ''}`}>
                  {stat.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Analysis + PSF Chart side by side */}
        <div className="grid grid-cols-[1fr_360px] gap-5 mb-6">
          <InvestmentAnalysis project={p} allProjects={allProjects ?? []} />
          <div className="space-y-4">
            <div className="card p-5">
              <p className="section-label mb-4">PSF history</p>
              <PsfChart data={p.psf_history ?? []} />
            </div>
          </div>
        </div>

        {/* Risk/Reward Matrix */}
        <RiskRewardMatrix projects={allProjects ?? []} currentSlug={p.slug} />

        {/* IRR Calculator */}
        {isPaid ? (
          <IrrCalculator project={p} paymentPlans={p.payment_plans ?? []} />
        ) : (
          <PaywallBanner
            title="Payment plan IRR calculator"
            description="Compare every payment plan's annualised return side by side. Upgrade to Investor."
          />
        )}

        {/* Developer scorecard */}
        {isPaid ? (
          <DeveloperCard developer={p.developer} />
        ) : (
          <PaywallBanner
            title="Developer scorecard"
            description="On-time delivery rate, RERA complaints, historical ROI. All scored."
          />
        )}

        {/* Data sources */}
        <div className="mt-10 pt-6 divider">
          <p className="section-label mb-4">Data sources</p>
          <div className="grid grid-cols-4 gap-4">
            {[
              { color: 'bg-blue-500', name: 'Property Finder', desc: 'Listing prices, unit types, project details' },
              { color: 'bg-green-500', name: 'Dubai Land Department', desc: 'Transaction records, PSF history' },
              { color: 'bg-purple-500', name: 'Developer Filings', desc: 'Payment plans, handover dates, brochures' },
              { color: 'bg-amber-500', name: 'RERA', desc: 'Complaints, violations, registration' },
            ].map(src => (
              <div key={src.name} className="flex items-start gap-2.5">
                <span className={`w-1.5 h-1.5 rounded-full ${src.color} mt-1.5 shrink-0`} />
                <div>
                  <p className="text-xs font-medium text-gray-600">{src.name}</p>
                  <p className="text-xs text-gray-400">{src.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Analysis is algorithmic and does not constitute financial advice.
            Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>

      </div>
    </div>
  )
}
