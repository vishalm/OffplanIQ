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

  const isPaid = profile?.subscription_tier !== 'free'

  // Fetch project — try slug first, then id
  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      developer:developer_id(*),
      payment_plans(*),
      psf_history(recorded_date, psf, source)
    `)
    .or(`slug.eq.${params.id},id.eq.${params.id}`)
    .single()

  if (!project) notFound()

  // Check if user has watchlisted this project
  const { data: watchlistEntry } = await supabase
    .from('watchlist')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('project_id', project.id)
    .single()

  const isWatchlisted = !!watchlistEntry

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
            <h1 className="text-2xl font-medium text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {project.area} · {project.developer?.name} · {project.total_units} units · Handover {project.current_handover_date}
            </p>
            <div className="flex gap-2 mt-3">
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                project.handover_status === 'on_track'
                  ? 'bg-green-50 text-green-700'
                  : project.handover_status === 'delayed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {project.handover_status.replace('_', ' ')}
              </span>
              {project.rera_project_id && (
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                  RERA {project.rera_project_id}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WatchlistButton
              projectId={project.id}
              userId={session.user.id}
              isWatchlisted={isWatchlisted}
            />
            <ScoreBadge score={project.score} size="lg" breakdown={project.score_breakdown} />
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Launch PSF', value: `AED ${project.launch_psf?.toLocaleString()}`, sub: project.launch_date },
            {
              label: 'Current PSF',
              value: `AED ${project.current_psf?.toLocaleString()}`,
              sub: project.launch_psf
                ? `${Math.round(((project.current_psf! - project.launch_psf) / project.launch_psf) * 100)}% since launch`
                : undefined,
              green: (project.current_psf ?? 0) > (project.launch_psf ?? 0),
            },
            {
              label: 'Sell-through',
              value: `${project.sellthrough_pct}%`,
              sub: `${project.units_sold} of ${project.total_units} units`,
            },
            {
              label: 'Resale premium',
              value: `${project.resale_premium_pct > 0 ? '+' : ''}${project.resale_premium_pct}%`,
              sub: 'vs launch price',
              green: project.resale_premium_pct > 0,
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

        {/* PSF chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">PSF history</p>
          <PsfChart data={project.psf_history ?? []} />
        </div>

        {/* IRR Calculator — paid gate */}
        {isPaid ? (
          <IrrCalculator
            project={project}
            paymentPlans={project.payment_plans ?? []}
          />
        ) : (
          <PaywallBanner
            title="Payment plan IRR calculator"
            description="Compare every payment plan's annualised return side by side. Upgrade to Investor."
          />
        )}

        {/* Developer scorecard — paid gate */}
        {isPaid ? (
          <DeveloperCard developer={project.developer} />
        ) : (
          <PaywallBanner
            title="Developer scorecard"
            description="On-time delivery rate, RERA complaints, historical ROI — all scored."
          />
        )}

      </div>
    </div>
  )
}
