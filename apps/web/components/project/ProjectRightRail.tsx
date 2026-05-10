// apps/web/components/project/ProjectRightRail.tsx
//
// Sticky right rail for /projects/[id]. Holds the always-visible signals an
// investor checks repeatedly while scrolling the main column:
//
//   - Key facts table — total units, floors, plan summary, launch psf
//   - Developer mini  — tier, score, "view developer" link
//   - Quick actions   — compare, copy slug, last updated
//
// Sticks to the top on lg+ via `lg:sticky lg:top-4` on the wrapper. On mobile
// it just stacks below the main column.

import Link from 'next/link'
import { SectionHeader } from './SectionHeader'

interface Props {
  project: any
  hidePsf: boolean
}

export function ProjectRightRail({ project: p, hidePsf }: Readonly<Props>) {
  const facts = buildFacts(p, hidePsf)
  const tier  = pickTier(p.developer)
  const dev   = p.developer

  return (
    <aside className="space-y-4 lg:sticky lg:top-4">
      {/* Key facts */}
      <div className="card p-5">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-gray-400 font-medium mb-3">Key facts</p>
        <dl className="divide-y divide-gray-100 text-[13px]">
          {facts.map(f => (
            <div key={f.label} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              <dt className="text-gray-500 shrink-0 min-w-[110px]">{f.label}</dt>
              <dd className="text-gray-900 font-medium tabular-nums text-right ml-auto truncate">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Developer mini */}
      {dev && (
        <div className="card p-5">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-gray-400 font-medium mb-3">Developer</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
              {dev.name?.[0] ?? '·'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900 truncate">{dev.name}</p>
              {tier && <p className="text-[11.5px] text-gray-500 truncate">{tier}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Score</p>
              <p className="text-[15px] font-semibold text-gray-900 tabular-nums">{dev.developer_score ?? '—'}<span className="text-[11px] text-gray-400 font-normal">/100</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Active</p>
              <p className="text-[15px] font-semibold text-gray-900 tabular-nums">{dev.active_projects ?? '—'}</p>
            </div>
          </div>
          {dev.slug && (
            <Link href={`/search?developer=${encodeURIComponent(dev.name ?? '')}`} className="block mt-3 text-center text-[12.5px] text-blue-600 hover:underline">
              See all {dev.name} projects →
            </Link>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="card p-5">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-gray-400 font-medium mb-3">Quick actions</p>
        <div className="space-y-2">
          <Link href={`/search?developer=${encodeURIComponent(p.developer?.name ?? '')}`} className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h12M9 12h12M9 19h12M5 5h0M5 12h0M5 19h0" />
            </svg>
            Compare with developer's portfolio
          </Link>
          <Link href={`/insights?seed=${encodeURIComponent(`Find similar projects to ${p.name}`)}`} className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z" />
            </svg>
            Find similar in Insights
          </Link>
          <Link href={`/ask/new?seed=${encodeURIComponent(`Tell me about ${p.name}`)}`} className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Ask the analyst about this project
          </Link>
        </div>
      </div>

      <p className="text-[10.5px] text-gray-400 text-center">
        Sources: PF · DLD · Brochures · RERA. Algorithmic; not financial advice.
      </p>
    </aside>
  )
}


// ─── helpers ─────────────────────────────────────────────────

function buildFacts(p: any, hidePsf: boolean): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []

  if (p.total_units)          facts.push({ label: 'Total units',         value: p.total_units.toLocaleString() })
  if (p.total_floors)         facts.push({ label: 'Floors',              value: String(p.total_floors) })

  if (p.unit_types && Array.isArray(p.unit_types) && p.unit_types.length > 0) {
    facts.push({ label: 'Unit mix', value: p.unit_types.map(humaniseUnitType).join(', ') })
  }

  if (p.min_price && p.max_price) {
    facts.push({ label: 'Price range', value: `${formatAed(p.min_price)} – ${formatAed(p.max_price)}` })
  } else if (p.min_price) {
    facts.push({ label: 'Starting from', value: formatAed(p.min_price) })
  }

  if (!hidePsf && p.launch_psf) facts.push({ label: 'Launch PSF', value: `AED ${p.launch_psf.toLocaleString()}` })

  if (p.current_handover_date) {
    facts.push({ label: 'Handover', value: formatDate(p.current_handover_date) })
  }
  if (p.handover_delay_days != null && p.handover_delay_days > 0) {
    facts.push({ label: 'Delay', value: `${Math.round(p.handover_delay_days / 30)} months` })
  }

  if (p.payment_plans && p.payment_plans.length > 0) {
    const plan = p.payment_plans[0]
    const summary = `${plan.down_payment_pct ?? '—'}/${plan.construction_pct ?? '—'}/${plan.handover_pct ?? '—'}`
    facts.push({ label: 'Plan', value: summary })
  }

  if (p.area)            facts.push({ label: 'Area', value: p.area })
  if (p.city)            facts.push({ label: 'Emirate', value: p.city })

  return facts
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
  if (/^\d+br$/i.test(v)) return v.replace(/br/i, ' BR').toUpperCase()
  return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
