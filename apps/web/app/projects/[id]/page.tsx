// apps/web/app/projects/[id]/page.tsx
//
// SCREEN 2: Project Detail
// The core value page — investors spend 80% of time here.
//
// Sections:
//   1. Hero: name, developer, score badge, status
//   2. Key stats: launch PSF, current PSF, sell-through, resale premium
//   3. PSF history chart (Recharts LineChart)
//   4. Payment plan IRR calculator (client component — interactive)
//   5. Developer scorecard
//   6. Watchlist button
//
// Gate: IRR calculator + developer scorecard → paid only

import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PsfChart } from '@/components/charts/PsfChart'
import { IrrCalculator } from '@/components/project/IrrCalculator'
import { DeveloperCard } from '@/components/project/DeveloperCard'
import { ScoreBadge } from '@/components/project/ScoreBadge'
import { WatchlistButton } from '@/components/project/WatchlistButton'
import { PaywallBanner } from '@/components/ui/PaywallBanner'
import { InvestmentAnalysis } from '@/components/project/InvestmentAnalysis'

interface Props {
  params: { id: string }
}

export default async function ProjectDetailPage({ params }: Props) {
  const supabase = createServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', session.user.id)
    .single()

  const isPaid = (profile as any)?.subscription_tier !== 'free'

  // Fetch project by slug
  let { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      developer:developer_id(*),
      payment_plans(*),
      psf_history(recorded_date, psf, source)
    `)
    .eq('slug', params.id)
    .single()

  // Fallback: try by UUID if slug didn't match
  if (!project) {
    const { data: byId } = await supabase
      .from('projects')
      .select(`
        *,
        developer:developer_id(*),
        payment_plans(*),
        psf_history(recorded_date, psf, source)
      `)
      .eq('id', params.id)
      .single()
    project = byId
  }

  const p = project as any
  if (!p) notFound()

  // Check if user has watchlisted this project
  const { data: watchlistEntry } = await supabase
    .from('watchlist')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('project_id', p.id)
    .single()

  const isWatchlisted = !!watchlistEntry

  // Fetch comparable projects for analysis
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, slug, area, score, current_psf, sellthrough_pct, handover_status, developer:developer_id(name)')
    .in('status', ['active', 'pre_launch'])
    .order('score', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Back nav */}
        <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">
          ← Back to feed
        </a>

        {/* Hero */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-medium text-gray-900">{p.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {p.area} · {p.developer?.name} · {p.total_units} units · Handover {p.current_handover_date}
            </p>
            <div className="flex gap-2 mt-3">
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                p.handover_status === 'on_track'
                  ? 'bg-green-50 text-green-700'
                  : p.handover_status === 'delayed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {p.handover_status.replace('_', ' ')}
              </span>
              {p.rera_project_id && (
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                  RERA {p.rera_project_id}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WatchlistButton
              projectId={p.id}
              userId={session.user.id}
              isWatchlisted={isWatchlisted}
            />
            <ScoreBadge score={p.score} size="lg" breakdown={p.score_breakdown} />
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Launch PSF', value: `AED ${p.launch_psf?.toLocaleString()}`, sub: p.launch_date },
            {
              label: 'Current PSF',
              value: `AED ${p.current_psf?.toLocaleString()}`,
              sub: p.launch_psf
                ? `${Math.round(((p.current_psf! - p.launch_psf) / p.launch_psf) * 100)}% since launch`
                : undefined,
              green: (p.current_psf ?? 0) > (p.launch_psf ?? 0),
            },
            {
              label: 'Sell-through',
              value: `${p.sellthrough_pct}%`,
              sub: `${p.units_sold} of ${p.total_units} units`,
            },
            {
              label: 'Resale premium',
              value: `${p.resale_premium_pct > 0 ? '+' : ''}${p.resale_premium_pct}%`,
              sub: 'vs launch price',
              green: p.resale_premium_pct > 0,
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className={`text-lg font-medium ${stat.green ? 'text-green-700' : 'text-gray-900'}`}>
                {stat.value}
              </p>
              {stat.sub && <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>}
            </div>
          ))}
        </div>

        {/* AI Investment Analysis */}
        <InvestmentAnalysis project={p} allProjects={allProjects ?? []} />

        {/* PSF chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">PSF history</p>
          <PsfChart data={p.psf_history ?? []} />
        </div>

        {/* IRR Calculator — paid gate */}
        {isPaid ? (
          <IrrCalculator
            project={p}
            paymentPlans={p.payment_plans ?? []}
          />
        ) : (
          <PaywallBanner
            title="Payment plan IRR calculator"
            description="Compare every payment plan's annualised return side by side. Upgrade to Investor."
          />
        )}

        {/* Developer scorecard — paid gate */}
        {isPaid ? (
          <DeveloperCard developer={p.developer} />
        ) : (
          <PaywallBanner
            title="Developer scorecard"
            description="On-time delivery rate, RERA complaints, historical ROI. All scored."
          />
        )}

        {/* Data sources citation */}
        <div className="mt-8 border-t border-gray-200 pt-5">
          <p className="text-xs font-medium text-gray-500 mb-2">Data Sources</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-700">Property Finder</p>
                <p className="text-xs text-gray-400">Listing prices, unit types, project details. Scraped live.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-700">Dubai Land Department</p>
                <p className="text-xs text-gray-400">Transaction records, PSF history, registration data.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-700">Developer Filings</p>
                <p className="text-xs text-gray-400">Payment plans, handover dates, unit counts, brochures.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-700">RERA</p>
                <p className="text-xs text-gray-400">Developer complaints, violations, registration status.</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Scores and analysis are algorithmic and do not constitute financial advice.
            Last updated: {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>

      </div>
    </div>
  )
}
