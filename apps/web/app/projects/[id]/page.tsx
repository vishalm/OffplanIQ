// apps/web/app/projects/[id]/page.tsx
//
// Investor decision page — designed so a visitor answers "is this a buy?"
// in 30 seconds, then drills in for evidence.
//
// Layout:
//   Hero (full-width)        — identity + AI verdict + score + actions
//   KPI strip (full-width)   — 4 numbers vs area baseline
//   ┌── 8 col main ────────┬── 4 col sticky rail ──┐
//   │ score breakdown      │ key facts             │
//   │ PSF history          │ developer mini        │
//   │ AI narrative         │ quick actions         │
//   │ investment thesis    │ peer strip            │
//   │ risk vs reward       │                       │
//   │ IRR calculator       │                       │
//   │ developer card       │                       │
//   │ sources              │                       │
//   └──────────────────────┴───────────────────────┘
//
// Composition layer only — every viz uses the existing components. The page
// function is a thin orchestrator; Hero/KpiStrip/ScoreBreakdown/RightRail
// hold the visual logic, helpers at the bottom hold the math.

import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PsfChart } from '@/components/charts/PsfChart'
import { IrrCalculator } from '@/components/project/IrrCalculator'
import { DeveloperCard } from '@/components/project/DeveloperCard'
import { WatchlistButton } from '@/components/project/WatchlistButton'
import { PaywallBanner } from '@/components/ui/PaywallBanner'
import { InvestmentAnalysis } from '@/components/project/InvestmentAnalysis'
import { InvestmentGauge } from '@/components/charts/InvestmentGauge'
import { RiskRewardMatrix } from '@/components/charts/RiskRewardMatrix'
import { ProjectNarrative } from '@/components/project/ProjectNarrative'
import { disableUiComponentsDueToLackOfData } from '@/lib/featureFlags'

const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'
const KPI_LABEL     = 'text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500'
const RAIL_LABEL    = 'text-[10.5px] uppercase tracking-[0.14em] text-slate-400 font-medium'

type Tone = 'good' | 'mid' | 'warn'
type ScoreBand = { label: string; tone: Tone }
type ProximityLabel = { label: string; tone: Tone } | null

export const dynamic = 'force-dynamic'

export default async function ProjectDetailPage({ params }: Readonly<{ params: { id: string } }>) {
  const ctx = await loadPageData(params.id)
  if (!ctx) notFound()
  const { p, isPaid, peers, watchlistEntry, userId } = ctx

  const view = computeViewModel(p, peers)
  const hidePsfComponents = disableUiComponentsDueToLackOfData

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 pb-16 space-y-6">

        <Breadcrumb name={p.name} />

        <Hero
          p={p}
          userId={userId}
          isWatchlisted={!!watchlistEntry}
          handoverDate={view.handoverDate}
          tierLabel={view.tierLabel}
          verdict={view.verdict}
          scoreBand={view.scoreBand}
          totalProjects={view.totalProjects}
          overallRank={view.overallRank}
          scoreVsArea={view.scoreVsArea}
          areaAvgScore={view.areaAvgScore}
        />

        <KpiStrip
          p={p}
          hidePsf={hidePsfComponents}
          psfDelta={view.psfDelta}
          psfVsArea={view.psfVsArea}
          handoverDate={view.handoverDate}
          handoverProx={view.handoverProx}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-5">

            <ScoreBreakdown
              score={p.score}
              breakdown={p.score_breakdown}
              dims={view.breakdownDims}
            />

            {!hidePsfComponents && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
                <div>
                  <p className={SECTION_LABEL}>Price trajectory</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">PSF history</h2>
                  <p className="mt-1 text-[13px] text-slate-500">Rolling 180-day median from DLD-matched transactions.</p>
                </div>
                <div className="mt-5">
                  <PsfChart data={p.psf_history ?? []} />
                </div>
              </section>
            )}

            <ProjectNarrative project={p} />
            <InvestmentAnalysis project={p} allProjects={peers} />
            <RiskRewardMatrix projects={peers} currentSlug={p.slug} />

            <IrrSection p={p} isPaid={isPaid} />

            {isPaid ? (
              <DeveloperCard developer={p.developer} />
            ) : (
              <PaywallBanner
                title="Developer scorecard"
                description="On-time delivery rate, RERA complaints, historical ROI. All scored."
              />
            )}

            <Sources />
          </div>

          <RightRail
            p={p}
            tierLabel={view.tierLabel}
            peerStrip={view.peerStrip}
            hidePsf={hidePsfComponents}
          />
        </div>
      </div>
    </div>
  )
}


// ─── Page-level data + view-model ────────────────────────────

async function loadPageData(slugOrId: string) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('subscription_tier').eq('id', session.user.id).single()
  const isPaid = (profile as any)?.subscription_tier !== 'free'

  const projectSelect = '*, developer:developer_id(*), payment_plans(*), psf_history(recorded_date, psf, source)'

  let { data: project } = await supabase.from('projects').select(projectSelect).eq('slug', slugOrId).single()
  if (!project) {
    const { data: byId } = await supabase.from('projects').select(projectSelect).eq('id', slugOrId).single()
    project = byId
  }
  const p = project as any
  if (!p) return null

  const { data: watchlistEntry } = await supabase.from('watchlist')
    .select('id').eq('user_id', session.user.id).eq('project_id', p.id).maybeSingle()

  const { data: allProjects } = await supabase.from('projects')
    .select('id, name, slug, area, score, current_psf, launch_psf, sellthrough_pct, handover_status, handover_delay_days, developer:developer_id(name)')
    .in('status', ['active', 'pre_launch']).order('score', { ascending: false })

  return {
    p,
    isPaid,
    peers: (allProjects ?? []) as any[],
    watchlistEntry,
    userId: session.user.id,
  }
}


function computeViewModel(p: any, peers: any[]) {
  const totalProjects = peers.length
  const overallRank   = peers.findIndex(x => x.id === p.id) + 1
  const areaPeers     = peers.filter(x => x.area === p.area && x.id !== p.id)

  const areaPsfPeers  = areaPeers.filter(x => (x.current_psf ?? 0) > 0)
  const areaAvgPsf    = avgOf(areaPsfPeers, x => x.current_psf)
  const areaAvgScore  = avgOf(areaPeers,    x => x.score ?? 0)

  const psfVsArea = (p.current_psf > 0 && areaAvgPsf > 0)
    ? Math.round(((p.current_psf - areaAvgPsf) / areaAvgPsf) * 100)
    : null
  const scoreVsArea = (typeof p.score === 'number' && areaAvgScore > 0)
    ? p.score - areaAvgScore : null

  const psfDelta = (p.launch_psf && p.current_psf)
    ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100)
    : null

  const breakdown = p.score_breakdown
  const scoreBand = pickScoreBand(p.score)
  const verdict   = buildVerdict(scoreBand.label, breakdown)

  const handoverDate = p.current_handover_date ? new Date(p.current_handover_date) : null
  const handoverMonthsOut = handoverDate
    ? Math.round((handoverDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
    : null
  const handoverProx = handoverProximity(handoverMonthsOut)

  const breakdownDims = [
    { label: 'Sell-through', value: breakdown?.sellthrough ?? 0, max: 35, color: 'bg-blue-500',   note: sellthroughNote(p) },
    { label: 'PSF momentum', value: breakdown?.psf_delta   ?? 0, max: 20, color: 'bg-purple-500', note: psfMomentumNote(psfDelta) },
    { label: 'Developer',    value: breakdown?.developer   ?? 0, max: 30, color: 'bg-teal-500',   note: developerNote(p.developer?.developer_score) },
    { label: 'Handover',     value: breakdown?.handover    ?? 0, max: 15, color: 'bg-amber-500',  note: handoverProx?.label ?? 'Handover date unconfirmed' },
  ]

  return {
    totalProjects,
    overallRank,
    areaAvgScore,
    psfDelta,
    psfVsArea,
    scoreVsArea,
    scoreBand,
    verdict,
    handoverDate,
    handoverProx,
    breakdownDims,
    peerStrip: areaPeers.slice(0, 5),
    tierLabel: pickTier(p.developer),
  }
}


function avgOf<T>(rows: T[], pick: (r: T) => number): number {
  if (rows.length === 0) return 0
  return Math.round(rows.reduce((s, x) => s + (pick(x) ?? 0), 0) / rows.length)
}


// ─── Sub-components ──────────────────────────────────────────

function Breadcrumb({ name }: Readonly<{ name: string }>) {
  return (
    <nav className="flex items-center gap-2 text-[12px] text-slate-400" aria-label="Breadcrumb">
      <Link href="/analytics" className="transition-colors hover:text-slate-600">Analytics</Link>
      <Chevron />
      <Link href="/search" className="transition-colors hover:text-slate-600">Search</Link>
      <Chevron />
      <span className="max-w-[260px] truncate font-medium text-slate-700">{name}</span>
    </nav>
  )
}


interface HeroProps {
  p: any
  userId: string
  isWatchlisted: boolean
  handoverDate: Date | null
  tierLabel: string | null
  verdict: string
  scoreBand: ScoreBand
  totalProjects: number
  overallRank: number
  scoreVsArea: number | null
  areaAvgScore: number
}

function Hero(props: Readonly<HeroProps>) {
  const { p, userId, isWatchlisted, handoverDate, tierLabel, verdict, scoreBand,
          totalProjects, overallRank, scoreVsArea, areaAvgScore } = props
  const bandClass = bandClassFor(scoreBand.tone)

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Identity */}
        <div className="space-y-5">
          <HeroPills p={p} handoverDate={handoverDate} tierLabel={tierLabel} />

          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 md:text-[40px]">{p.name}</h1>
            {p.developer?.name && (
              <p className="mt-2 text-[15px] text-slate-600">
                by <span className="font-semibold text-slate-900">{p.developer.name}</span>
                <span className="mx-2 text-slate-300">·</span>
                {p.area}
                {p.city && <><span className="mx-2 text-slate-300">·</span>{p.city}</>}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-700">AI verdict</p>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-800">{verdict}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <WatchlistButton projectId={p.id} userId={userId} isWatchlisted={isWatchlisted} />
            <Link
              href={`/search?city=${encodeURIComponent(p.area || '')}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Compare in {p.area || 'area'}
            </Link>
            <a
              href="#irr"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Open IRR calculator
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12L12 4.5m7.5 7.5L12 19.5m7.5-7.5h-15" />
              </svg>
            </a>
          </div>
        </div>

        {/* Score block */}
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-slate-50 p-6 text-center lg:bg-transparent lg:border-l lg:border-slate-200 lg:rounded-none lg:pl-8">
          <InvestmentGauge score={p.score} size={180} />
          <div className="space-y-2">
            <span className={`inline-block rounded-full border px-3 py-1 text-[12px] font-semibold ${bandClass}`}>
              {scoreBand.label}
            </span>
            {totalProjects > 0 && overallRank > 0 && (
              <p className="text-[12px] text-slate-500">
                Ranked <span className="font-semibold text-slate-900">#{overallRank}</span> of {totalProjects.toLocaleString()}
              </p>
            )}
            {scoreVsArea !== null && (
              <p className="text-[12px] text-slate-500">
                {scoreVsArea >= 0 ? '+' : ''}{scoreVsArea} vs {p.area} avg ({areaAvgScore})
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}


function HeroPills({ p, handoverDate, tierLabel }: Readonly<{ p: any; handoverDate: Date | null; tierLabel: string | null }>) {
  const isDelayed   = (p.handover_delay_days ?? 0) > 0
  const isOnSchedule = !isDelayed && handoverDate
  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.status === 'pre_launch' && (
        <Pill tone="blue">Pre-launch</Pill>
      )}
      {isDelayed && (
        <Pill tone="red">{Math.round(p.handover_delay_days / 30)}mo delayed</Pill>
      )}
      {isOnSchedule && (
        <Pill tone="emerald">On schedule</Pill>
      )}
      {p.area && <Pill tone="slate">{p.area}</Pill>}
      {tierLabel && <Pill tone="violet">{tierLabel}</Pill>}
    </div>
  )
}


function Pill({ tone, children }: Readonly<{ tone: 'blue'|'red'|'emerald'|'slate'|'violet'; children: React.ReactNode }>) {
  const palette: Record<string, string> = {
    blue:    'bg-blue-100 text-blue-700',
    red:     'bg-red-100 text-red-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate:   'bg-slate-100 text-slate-700',
    violet:  'bg-violet-50 border border-violet-100 text-violet-700',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${palette[tone]}`}>{children}</span>
  )
}


interface KpiStripProps {
  p: any
  hidePsf: boolean
  psfDelta: number | null
  psfVsArea: number | null
  handoverDate: Date | null
  handoverProx: ProximityLabel
}

function KpiStrip({ p, hidePsf, psfDelta, psfVsArea, handoverDate, handoverProx }: Readonly<KpiStripProps>) {
  return (
    <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCardCurrentPsf p={p} hidePsf={hidePsf} psfVsArea={psfVsArea} />
      <KpiCardSinceLaunch psfDelta={psfDelta} launchPsf={p.launch_psf} />
      <KpiCardSellthrough p={p} />
      <KpiCardHandover handoverDate={handoverDate} handoverProx={handoverProx} />
    </section>
  )
}

function KpiCardCurrentPsf({ p, hidePsf, psfVsArea }: Readonly<{ p: any; hidePsf: boolean; psfVsArea: number | null }>) {
  if (hidePsf) {
    return (
      <KpiCard label="Current PSF">
        <p className="mt-3 text-[13px] text-slate-500">Hidden while we improve coverage.</p>
      </KpiCard>
    )
  }
  return (
    <KpiCard label="Current PSF">
      <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-950">
        {p.current_psf > 0 ? `AED ${p.current_psf.toLocaleString()}` : '—'}
      </p>
      <p className="text-[11px] text-slate-400">per sqft</p>
      {psfVsArea !== null && (
        <p className={`mt-2 text-[12px] font-medium ${psfVsAreaClass(psfVsArea)}`}>
          {psfVsArea > 0 ? '+' : ''}{psfVsArea}% vs {p.area} avg
        </p>
      )}
    </KpiCard>
  )
}

function psfVsAreaClass(delta: number): string {
  if (delta > 5)   return 'text-amber-700'
  if (delta < -5)  return 'text-emerald-700'
  return 'text-slate-500'
}

function KpiCardSinceLaunch({ psfDelta, launchPsf }: Readonly<{ psfDelta: number | null; launchPsf: number | null }>) {
  if (psfDelta === null) {
    return (
      <KpiCard label="Since launch">
        <p className="mt-3 text-[13px] text-slate-500">Launch PSF unavailable.</p>
      </KpiCard>
    )
  }
  return (
    <KpiCard label="Since launch">
      <p className={`mt-3 text-[26px] font-semibold tabular-nums ${psfDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {psfDelta > 0 ? '+' : ''}{psfDelta}%
      </p>
      <p className="text-[11px] text-slate-400">PSF appreciation</p>
      {Boolean(launchPsf && launchPsf > 0) && (
        <p className="mt-2 text-[12px] text-slate-500">From AED {launchPsf?.toLocaleString()}/sqft</p>
      )}
    </KpiCard>
  )
}

function KpiCardSellthrough({ p }: Readonly<{ p: any }>) {
  if ((p.total_units ?? 0) > 0) {
    return (
      <KpiCard label="Sell-through">
        <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-950">
          {Math.round((p.units_sold / p.total_units) * 100)}%
        </p>
        <p className="text-[11px] text-slate-400">{p.units_sold} of {p.total_units} units</p>
      </KpiCard>
    )
  }
  return (
    <KpiCard label="Sell-through">
      <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-950">{p.units_sold ?? 0}</p>
      <p className="text-[11px] text-slate-400">DLD-matched sales</p>
      <p className="mt-2 text-[12px] text-slate-500">Inventory size unconfirmed</p>
    </KpiCard>
  )
}

function KpiCardHandover({ handoverDate, handoverProx }: Readonly<{ handoverDate: Date | null; handoverProx: ProximityLabel }>) {
  if (!handoverDate) {
    return (
      <KpiCard label="Handover">
        <p className="mt-3 text-[13px] text-slate-500">Date unconfirmed.</p>
      </KpiCard>
    )
  }
  return (
    <KpiCard label="Handover">
      <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-950">
        {handoverDate.toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })}
      </p>
      <p className="text-[11px] text-slate-400">expected delivery</p>
      {handoverProx && (
        <p className={`mt-2 text-[12px] font-medium ${proxToneClass(handoverProx.tone)}`}>{handoverProx.label}</p>
      )}
    </KpiCard>
  )
}

function proxToneClass(tone: Tone): string {
  if (tone === 'warn') return 'text-red-600'
  if (tone === 'mid')  return 'text-amber-700'
  return 'text-slate-500'
}

function KpiCard({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className={KPI_LABEL}>{label}</p>
      {children}
    </div>
  )
}


interface ScoreBreakdownProps {
  score: number | null | undefined
  breakdown: any
  dims: Array<{ label: string; value: number; max: number; color: string; note: string }>
}

function ScoreBreakdown({ score, breakdown, dims }: Readonly<ScoreBreakdownProps>) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={SECTION_LABEL}>Why this score</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Score breakdown</h2>
          <p className="mt-1 text-[13px] text-slate-500">Composite signal across four dimensions, max 100.</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-4xl font-semibold tabular-nums text-slate-950">{score ?? 0}</p>
          <p className="text-[11px] text-slate-400">out of 100</p>
        </div>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {dims.map(d => {
          const pct = d.max > 0 ? Math.min(100, Math.round((d.value / d.max) * 100)) : 0
          return (
            <div key={d.label}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-slate-900">{d.label}</span>
                <span className="font-semibold tabular-nums text-slate-950">
                  {d.value}<span className="text-slate-400">/{d.max}</span>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${d.color}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] text-slate-500">{d.note}</p>
            </div>
          )
        })}
      </div>
      {!breakdown && (
        <p className="mt-4 text-[12px] text-slate-400">Detailed breakdown not yet computed for this project.</p>
      )}
    </section>
  )
}


function IrrSection({ p, isPaid }: Readonly<{ p: any; isPaid: boolean }>) {
  const planCount = p.payment_plans?.length ?? 0
  return (
    <section
      id="irr"
      className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-6 shadow-sm md:p-7 scroll-mt-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Calculator</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Payment plan IRR</h2>
          <p className="mt-1 max-w-xl text-[13px] text-slate-600">
            Compare every published payment plan side-by-side. See annualised return assuming current PSF holds through handover.
          </p>
        </div>
        {planCount > 0 && (
          <p className="text-[12px] text-slate-500">
            <span className="font-semibold text-slate-900">{planCount}</span> published plan{planCount === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="mt-6">
        {isPaid ? (
          <IrrCalculator project={p} paymentPlans={p.payment_plans ?? []} />
        ) : (
          <PaywallBanner
            title="Unlock the IRR calculator"
            description="Compare every payment plan's annualised return. Upgrade to Investor."
          />
        )}
      </div>
    </section>
  )
}


function Sources() {
  return (
    <div className="border-t border-slate-200/70 pt-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>Sources: Property Finder, DLD, developer filings, RERA</span>
        <span aria-hidden>·</span>
        <span>Algorithmic analysis. Not financial advice.</span>
        <span aria-hidden>·</span>
        <span>Updated {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  )
}


interface RightRailProps {
  p: any
  tierLabel: string | null
  peerStrip: any[]
  hidePsf: boolean
}

function RightRail({ p, tierLabel, peerStrip, hidePsf }: Readonly<RightRailProps>) {
  return (
    <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-4 lg:self-start">
      <KeyFactsCard p={p} hidePsf={hidePsf} />
      {p.developer && <DeveloperMiniCard developer={p.developer} tierLabel={tierLabel} />}
      <QuickActionsCard p={p} />
      {peerStrip.length > 0 && <PeerStripCard p={p} peerStrip={peerStrip} />}
    </aside>
  )
}


function KeyFactsCard({ p, hidePsf }: Readonly<{ p: any; hidePsf: boolean }>) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className={RAIL_LABEL}>Key facts</p>
      <dl className="mt-3 divide-y divide-slate-100 text-[13px]">
        {keyFacts(p, hidePsf).map(f => (
          <div key={f.label} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
            <dt className="text-slate-500 shrink-0 min-w-[110px]">{f.label}</dt>
            <dd className="text-slate-900 font-medium tabular-nums text-right ml-auto truncate">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}


function DeveloperMiniCard({ developer, tierLabel }: Readonly<{ developer: any; tierLabel: string | null }>) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className={RAIL_LABEL}>Developer</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
          {developer.name?.[0] ?? '·'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-slate-900 truncate">{developer.name}</p>
          {tierLabel && <p className="text-[11.5px] text-slate-500 truncate">{tierLabel}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Score</p>
          <p className="text-[15px] font-semibold text-slate-900 tabular-nums">
            {developer.developer_score ?? '—'}<span className="text-[11px] text-slate-400 font-normal">/100</span>
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Active</p>
          <p className="text-[15px] font-semibold text-slate-900 tabular-nums">{developer.active_projects ?? '—'}</p>
        </div>
      </div>
      <Link
        href={`/search?developer=${encodeURIComponent(developer.name ?? '')}`}
        className="block mt-3 text-center text-[12.5px] text-blue-600 hover:underline"
      >
        See all {developer.name} projects →
      </Link>
    </div>
  )
}


function QuickActionsCard({ p }: Readonly<{ p: any }>) {
  const similarSeed = `Find similar projects to ${p.name}`
  const askSeed     = `Tell me about ${p.name}`
  const mailSubject = `OffplanIQ — ${p.name}`
  const mailBody    = `Take a look: project ${p.slug}`
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className={RAIL_LABEL}>Quick actions</p>
      <div className="mt-3 space-y-2">
        <Link
          href={`/insights?seed=${encodeURIComponent(similarSeed)}`}
          className="flex items-center gap-2 text-[13px] text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z" />
          </svg>
          Find similar in Insights
        </Link>
        <Link
          href={`/ask/new?seed=${encodeURIComponent(askSeed)}`}
          className="flex items-center gap-2 text-[13px] text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Ask the analyst about this
        </Link>
        <a
          href={`mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`}
          className="flex items-center gap-2 text-[13px] text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share by email
        </a>
      </div>
    </div>
  )
}


function PeerStripCard({ p, peerStrip }: Readonly<{ p: any; peerStrip: any[] }>) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className={RAIL_LABEL}>Others in {p.area}</p>
        <Link href={`/search?city=${encodeURIComponent(p.area || '')}`} className="text-[11px] font-medium text-blue-600 hover:underline">
          See all
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {peerStrip.map(peer => (
          <li key={peer.id}>
            <Link
              href={`/projects/${peer.slug}`}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 group"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-900 group-hover:text-blue-600 transition-colors">{peer.name}</p>
                <p className="truncate text-[11px] text-slate-500">{peer.developer?.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[14px] font-semibold tabular-nums ${peerScoreClass(peer.score)}`}>{peer.score ?? '—'}</p>
                {(peer.current_psf ?? 0) > 0 && (
                  <p className="text-[10.5px] text-slate-400">{peer.current_psf.toLocaleString()}/sqft</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}


function peerScoreClass(score: number | null | undefined): string {
  const s = score ?? 0
  if (s >= 70) return 'text-emerald-600'
  if (s >= 55) return 'text-amber-600'
  return 'text-red-500'
}


// ─── helpers ─────────────────────────────────────────────────

function Chevron() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function pickScoreBand(score: number | null | undefined): ScoreBand {
  const s = score ?? 0
  if (s >= 85) return { label: 'Excellent signal', tone: 'good' }
  if (s >= 70) return { label: 'Strong signal',    tone: 'good' }
  if (s >= 55) return { label: 'Watch',            tone: 'mid'  }
  if (s >= 40) return { label: 'Caution',          tone: 'warn' }
  return            { label: 'Avoid',              tone: 'warn' }
}

function bandClassFor(tone: Tone): string {
  if (tone === 'good') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (tone === 'mid')  return 'text-amber-700 bg-amber-50 border-amber-200'
  return                      'text-red-700 bg-red-50 border-red-200'
}

function buildVerdict(bandLabel: string, breakdown: any): string {
  if (!breakdown) return `${bandLabel}.`
  const dims = [
    { key: 'sellthrough', label: 'sell-through velocity', max: 35 },
    { key: 'psf_delta',   label: 'PSF momentum',           max: 20 },
    { key: 'developer',   label: 'developer track record', max: 30 },
    { key: 'handover',    label: 'handover proximity',     max: 15 },
  ]
  const ranked = dims
    .map(d => ({ ...d, pct: ((breakdown as any)[d.key] ?? 0) / d.max }))
    .sort((a, b) => b.pct - a.pct)
  const top    = ranked[0]
  const bottom = ranked.at(-1)
  if (top && bottom && (top.pct - bottom.pct) > 0.2) {
    return `${bandLabel} — strong ${top.label}, weak ${bottom.label}.`
  }
  return `${bandLabel} — balanced across all four scoring dimensions.`
}

function handoverProximity(monthsOut: number | null): ProximityLabel {
  if (monthsOut === null) return null
  if (monthsOut < 0)   return { label: `${Math.abs(monthsOut)}mo past due`,        tone: 'warn' }
  if (monthsOut <= 12) return { label: `${monthsOut}mo — imminent`,                 tone: 'mid'  }
  if (monthsOut <= 36) return { label: `${monthsOut}mo away`,                       tone: 'good' }
  return                       { label: `${monthsOut}mo away — long horizon`,       tone: 'good' }
}

function sellthroughNote(p: any): string {
  if (!(p.total_units > 0)) {
    return (p.units_sold ?? 0) > 0
      ? `${p.units_sold} DLD-matched sales — total inventory unconfirmed`
      : 'No DLD-matched sales yet'
  }
  const pct = Math.round((p.units_sold / p.total_units) * 100)
  if (pct >= 80) return `${pct}% sold — high velocity`
  if (pct >= 50) return `${pct}% sold — healthy`
  if (pct >= 20) return `${pct}% sold — early stage`
  return `${pct}% sold — slow`
}

function psfMomentumNote(psfDelta: number | null): string {
  if (psfDelta === null) return 'Launch PSF unavailable'
  if (psfDelta >= 20) return `+${psfDelta}% since launch — strong appreciation`
  if (psfDelta >= 5)  return `+${psfDelta}% since launch — steady`
  if (psfDelta >= 0)  return `+${psfDelta}% since launch — flat`
  return `${psfDelta}% since launch — soft`
}

function developerNote(score: number | null | undefined): string {
  if (!score) return 'Developer not yet scored'
  if (score >= 85) return `Tier 1 (${score}) — strong track record`
  if (score >= 70) return `Tier 2 (${score}) — solid history`
  if (score >= 55) return `Tier 3 (${score}) — emerging`
  return `Tier 4 (${score}) — caution`
}

function pickTier(developer: any): string | null {
  if (!developer) return null
  if (developer.tier) return String(developer.tier)
  const s = developer.developer_score
  if (s == null) return null
  if (s >= 90) return 'Tier 1 · Blue chip'
  if (s >= 75) return 'Tier 2 · Premium'
  if (s >= 60) return 'Tier 3 · Mid-market'
  return 'Tier 4 · Long-tail'
}

function keyFacts(p: any, hidePsf: boolean): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []
  if (p.total_units)  facts.push({ label: 'Total units', value: p.total_units.toLocaleString() })
  if (p.total_floors) facts.push({ label: 'Floors',      value: String(p.total_floors) })
  if (p.unit_types && Array.isArray(p.unit_types) && p.unit_types.length > 0) {
    facts.push({ label: 'Unit mix', value: p.unit_types.map(humaniseUnitType).join(', ') })
  }
  if (p.min_price && p.max_price) {
    facts.push({ label: 'Price range', value: `${formatAed(p.min_price)} – ${formatAed(p.max_price)}` })
  } else if (p.min_price) {
    facts.push({ label: 'Starting from', value: formatAed(p.min_price) })
  }
  if (!hidePsf && p.launch_psf)   facts.push({ label: 'Launch PSF', value: `AED ${p.launch_psf.toLocaleString()}` })
  if (p.current_handover_date) facts.push({ label: 'Handover',   value: formatDate(p.current_handover_date) })
  if (p.payment_plans && p.payment_plans.length > 0) {
    const plan = p.payment_plans[0]
    facts.push({ label: 'Plan', value: `${plan.down_payment_pct ?? '—'}/${plan.construction_pct ?? '—'}/${plan.handover_pct ?? '—'}` })
  }
  if (p.area) facts.push({ label: 'Area',    value: p.area })
  if (p.city) facts.push({ label: 'Emirate', value: p.city })
  return facts
}

function formatAed(n: number): string {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000)     return `AED ${Math.round(n / 1_000)}K`
  return `AED ${n.toLocaleString()}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function humaniseUnitType(v: string): string {
  if (v === 'studio') return 'Studio'
  if (/^\d+br$/i.test(v)) return v.replaceAll('br', ' BR').toUpperCase()
  return v.replaceAll('_', ' ').replaceAll(/\b\w/g, c => c.toUpperCase())
}
