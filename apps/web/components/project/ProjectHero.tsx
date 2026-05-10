// apps/web/components/project/ProjectHero.tsx
//
// Full-width hero band for /projects/[id]. Pulls together the four pieces a
// visitor needs to make a 30-second judgement:
//
//   1. Status / tier pills (top row)
//   2. Project name (typographic anchor) + actions
//   3. Meta strip (developer · area · city · handover)
//   4. KPI strip — six glanceable numbers ranked by what closes the deal:
//        Score · PSF · PSF Δ · Sell-through · Handover proximity · Tier
//
// Numeric tiles intentionally use tabular-nums and identical heights so the
// strip reads as a single horizontal scan — not as six independent cards.

import { ReactNode } from 'react'
import { WatchlistButton } from '@/components/project/WatchlistButton'
import { InvestmentGauge } from '@/components/charts/InvestmentGauge'

interface Props {
  project:      any
  userId:       string
  isWatchlisted: boolean
  hidePsf:      boolean
}

export function ProjectHero({ project: p, userId, isWatchlisted, hidePsf }: Readonly<Props>) {
  const psfDelta = p.launch_psf && p.current_psf
    ? Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100)
    : null

  const sellthroughPct = (p.total_units || 0) > 0
    ? Math.round(((p.units_sold || 0) / p.total_units) * 100)
    : null

  const handoverMonths = monthsUntil(p.current_handover_date)
  const tier = pickTier(p.developer)

  return (
    <section className="card overflow-hidden mb-6">
      {/* Header band */}
      <div className="px-6 sm:px-8 pt-6 pb-5 sm:pt-7 sm:pb-6">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <StatusPill label={p.status === 'pre_launch' ? 'Pre-launch' : statusLabel(p.handover_status)}
                      tone={statusTone(p.status, p.handover_status)} />
          {tier && <StatusPill label={tier.label} tone={tier.tone} />}
          {p.handover_delay_days > 0 && (
            <StatusPill label={`${Math.round(p.handover_delay_days / 30)}mo delayed`} tone="red" />
          )}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[34px] sm:text-[40px] leading-[1.05] font-semibold tracking-tight text-gray-900">
              {p.name}
            </h1>
            <p className="text-[14px] text-gray-500 mt-2 truncate">
              {[p.developer?.name, p.area, p.city].filter(Boolean).join(' · ') || 'Unknown developer'}
              {p.current_handover_date && (
                <>
                  <span className="mx-2 text-gray-300">·</span>
                  <span>Handover {formatDate(p.current_handover_date)}</span>
                </>
              )}
            </p>

            <div className="mt-4 flex items-center gap-2">
              <WatchlistButton projectId={p.id} userId={userId} isWatchlisted={isWatchlisted} />
              <ShareButton name={p.name} />
            </div>
          </div>

          {/* Score gauge — sized down vs the old hero so it doesn't dominate. */}
          <div className="shrink-0">
            <InvestmentGauge score={p.score} size={120} />
          </div>
        </div>
      </div>

      {/* KPI strip — single horizontal scan. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-t border-gray-100">
        <Kpi
          label="Score"
          value={p.score != null ? `${p.score}` : '—'}
          sub={p.score != null ? '/100' : undefined}
          tone={scoreTone(p.score)}
        />
        <Kpi
          label="Current PSF"
          value={hidePsf || !p.current_psf ? '—' : `AED ${p.current_psf.toLocaleString()}`}
          sub={hidePsf || !p.current_psf ? undefined : '/sqft'}
        />
        <Kpi
          label="PSF since launch"
          value={hidePsf || psfDelta == null ? '—' : `${psfDelta > 0 ? '+' : ''}${psfDelta}%`}
          tone={psfDelta == null ? 'neutral' : psfDelta >= 0 ? 'pos' : 'neg'}
        />
        <Kpi
          label="Sell-through"
          value={sellthroughPct != null ? `${sellthroughPct}%` : (p.units_sold ? `${p.units_sold} sold` : '—')}
          sub={sellthroughPct != null ? `${p.units_sold}/${p.total_units}` : undefined}
          tone={sellthroughTone(sellthroughPct)}
        />
        <Kpi
          label="Handover in"
          value={handoverMonths != null ? `${handoverMonths}mo` : '—'}
          sub={p.current_handover_date ? formatDate(p.current_handover_date) : undefined}
          tone={handoverMonths == null ? 'neutral' : handoverMonths < 0 ? 'pos' : handoverMonths < 24 ? 'warn' : 'neutral'}
        />
        <Kpi
          label="Starting from"
          value={p.min_price ? `AED ${(p.min_price / 1_000_000).toFixed(p.min_price >= 10_000_000 ? 0 : 1)}M` : '—'}
          sub={p.max_price ? `to ${(p.max_price / 1_000_000).toFixed(0)}M` : undefined}
        />
      </div>
    </section>
  )
}


function Kpi({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral'|'pos'|'neg'|'warn' }) {
  let valueColor = 'text-gray-900'
  if (tone === 'pos')  valueColor = 'text-emerald-700'
  if (tone === 'neg')  valueColor = 'text-red-600'
  if (tone === 'warn') valueColor = 'text-amber-600'
  return (
    <div className="px-5 py-3.5 border-r border-b last:border-r-0 lg:border-b-0 border-gray-100 odd:bg-white even:bg-gray-50/30 lg:bg-white">
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-gray-400 font-medium">{label}</p>
      <p className={`text-[19px] font-semibold tabular-nums tracking-tight ${valueColor} mt-1`}>
        {value}
        {sub && <span className="text-[12px] text-gray-400 font-normal ml-1">{sub}</span>}
      </p>
    </div>
  )
}


function StatusPill({ label, tone }: { label: string; tone: 'green'|'red'|'amber'|'blue'|'gray'|'emerald'|'violet' }) {
  const palette: Record<string, string> = {
    green:    'bg-emerald-50 text-emerald-700 border-emerald-100',
    emerald:  'bg-emerald-50 text-emerald-700 border-emerald-100',
    red:      'bg-red-50 text-red-700 border-red-100',
    amber:    'bg-amber-50 text-amber-700 border-amber-100',
    blue:     'bg-blue-50 text-blue-700 border-blue-100',
    gray:     'bg-gray-50 text-gray-700 border-gray-200',
    violet:   'bg-violet-50 text-violet-700 border-violet-100',
  }
  return (
    <span className={`text-[10.5px] uppercase tracking-[0.1em] font-semibold px-2 py-0.5 rounded-full border ${palette[tone] ?? palette.gray}`}>
      {label}
    </span>
  )
}


function ShareButton({ name }: { name: string }) {
  return (
    <a
      href={`mailto:?subject=${encodeURIComponent('OffplanIQ — ' + name)}&body=${encodeURIComponent('Take a look: ' + (typeof window !== 'undefined' ? window.location.href : ''))}`}
      className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-full transition"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      Share
    </a>
  )
}


// ─── helpers ─────────────────────────────────────────────────

function statusLabel(s: string | null | undefined): string {
  if (!s) return 'Status'
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function statusTone(status: string | null | undefined, handoverStatus: string | null | undefined): 'green'|'red'|'amber'|'blue'|'gray' {
  if (status === 'pre_launch')          return 'blue'
  if (handoverStatus === 'on_track')    return 'green'
  if (handoverStatus === 'delayed')     return 'red'
  if (handoverStatus === 'near_handover') return 'amber'
  return 'gray'
}

function scoreTone(score: number | null | undefined): 'pos'|'warn'|'neg'|'neutral' {
  if (score == null) return 'neutral'
  if (score >= 75) return 'pos'
  if (score >= 55) return 'warn'
  return 'neg'
}

function sellthroughTone(pct: number | null): 'pos'|'warn'|'neg'|'neutral' {
  if (pct == null) return 'neutral'
  if (pct >= 70)   return 'pos'
  if (pct >= 40)   return 'warn'
  return 'neg'
}

function pickTier(developer: any): { label: string; tone: 'emerald'|'blue'|'amber'|'gray' } | null {
  // Prefer the curated string from the Excel master DB; fall back to score band.
  if (developer?.tier) {
    const t: string = String(developer.tier)
    if (/tier\s*1/i.test(t)) return { label: t, tone: 'emerald' }
    if (/tier\s*2/i.test(t)) return { label: t, tone: 'blue' }
    if (/tier\s*3/i.test(t)) return { label: t, tone: 'amber' }
    return { label: t, tone: 'gray' }
  }
  const s = developer?.developer_score
  if (s == null) return null
  if (s >= 90) return { label: 'Tier 1 · Blue chip', tone: 'emerald' }
  if (s >= 75) return { label: 'Tier 2 · Premium',   tone: 'blue' }
  if (s >= 60) return { label: 'Tier 3 · Mid-market',tone: 'amber' }
  return null
}

function monthsUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return null
  const days = Math.round((target - Date.now()) / (1000 * 60 * 60 * 24))
  return Math.round(days / 30)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
  } catch { return '—' }
}


export interface ProjectHeroData extends Record<string, ReactNode> {}
