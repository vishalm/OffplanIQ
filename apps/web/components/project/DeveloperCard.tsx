// apps/web/components/project/DeveloperCard.tsx
//
// Surfaces only metrics we can substantiate from real data sources today:
//   * Total / active projects:   real count from the projects table
//   * Developer score (0-100):   curated tier (top / premium / mid / long-tail)
//                                 with a project-count + avg-PSF tie-breaker
//                                 — see scripts/rank-developers.mjs
//   * Avg PSF across portfolio:  computed live from project rows that have
//                                 DLD-derived current_psf populated
//   * Tier · Founded · HQ · Key person · Hotline · Email — sourced from the
//     curated UAE master DB (Excel) when present.
//
// Deliberately omitted (no source yet):
//   * RERA complaints / violations — no public API
//   * On-time delivery %          — needs original_handover_date which we
//                                    don't yet capture
//   * Avg ROI                     — needs historical PSF (≥6 months depth)
//
// Showing "0 RERA complaints" or "100% on-time" without verifying would be
// dishonest to the property professionals using this product.

import type { Developer } from '@offplaniq/shared'

// Extended developer shape that includes the optional Excel-sourced fields.
// Using a wider type here lets the component render whatever the page query
// hands it without forcing every caller to upgrade simultaneously.
type ExtendedDeveloper = Developer & {
  // hq_location lives in the schema but isn't yet in @offplaniq/shared.
  hq_location?: string | null
  // Excel-sourced metadata (migration 20260507000001).
  tier?: string | null
  tier_rank?: number | null
  hq_address?: string | null
  key_person?: string | null
  phone_direct?: string | null
  phone_hotline?: string | null
  email?: string | null
  ownership_type?: string | null
  segments?: string | null
  employees?: string | null
  est_revenue?: string | null
  geographic_presence?: string | null
  stock_listing?: string | null
  social_media?: string | null
  // Renamed/extended URL columns.
  official_url?: string | null
}

interface Props {
  developer: ExtendedDeveloper | null | undefined
  /** Optional: average PSF across the developer's portfolio (DLD-derived). */
  avgPortfolioPsf?: number | null
}

const TIER_LABEL: Array<{ minScore: number; label: string; color: string }> = [
  { minScore: 90, label: 'Tier 1 · Blue chip', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { minScore: 75, label: 'Tier 2 · Premium',   color: 'bg-blue-50 text-blue-700 border-blue-200'         },
  { minScore: 60, label: 'Tier 3 · Mid-market',color: 'bg-amber-50 text-amber-700 border-amber-200'      },
  { minScore: 0,  label: 'Tier 4 · Long-tail', color: 'bg-gray-50 text-gray-600 border-gray-200'         },
]

function tierFor(score: number | null | undefined = 0) {
  const s = score ?? 0
  return TIER_LABEL.find(t => s >= t.minScore) || TIER_LABEL.at(-1)!
}


export function DeveloperCard({ developer, avgPortfolioPsf }: Readonly<Props>) {
  if (!developer) return null
  const tier = tierFor(developer.developer_score)
  // Prefer the curated tier label from the Excel master DB; fall back to the
  // score-derived tier above. Same labels — Excel just gives us the canonical
  // strings ("Tier 1 – Master Developer") for consistent display.
  const tierLabel = developer.tier || tier.label
  const websiteUrl = developer.official_url || developer.website_url || null

  const metrics: Array<{ label: string; value: string; good?: boolean; muted?: boolean }> = [
    {
      label: 'Active projects',
      value: developer.active_projects.toString(),
      good: true,
    },
    {
      label: 'Total projects',
      value: developer.total_projects_count.toString(),
      good: true,
    },
    {
      label: 'Developer score',
      value: developer.developer_score != null ? `${developer.developer_score}/100` : '—',
      good: (developer.developer_score ?? 0) >= 70,
    },
    {
      label: 'Avg portfolio PSF',
      value: avgPortfolioPsf ? `AED ${avgPortfolioPsf.toLocaleString()}` : '—',
      muted: avgPortfolioPsf == null || avgPortfolioPsf === 0,
    },
  ]

  // Fields sourced from the curated UAE master DB (Excel). Each entry is
  // rendered as a labelled row only when it has a real value — empty rows
  // are dropped so the card never shows "—" twice in a row.
  const profile: Array<[string, string | React.ReactNode]> = []
  if (developer.founded_year)         profile.push(['Founded', developer.founded_year.toString()])
  if (developer.hq_location)          profile.push(['HQ', developer.hq_location])
  if (developer.key_person)           profile.push(['Key person', developer.key_person])
  if (developer.ownership_type)       profile.push(['Ownership', developer.ownership_type])
  if (developer.employees)            profile.push(['Employees', developer.employees])
  if (developer.est_revenue)          profile.push(['Est. revenue', developer.est_revenue])
  if (developer.stock_listing)        profile.push(['Listing', developer.stock_listing])
  if (developer.geographic_presence)  profile.push(['Geo presence', developer.geographic_presence])
  if (developer.segments)             profile.push(['Segments', developer.segments])

  // Contact pills — clickable when a URL/scheme is sensible.
  const phone = developer.phone_hotline || developer.phone_direct
  const phoneHref = phone ? `tel:${phone.replaceAll(/[^0-9+]/g, '')}` : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
          {developer.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{developer.name}</p>
          <p className="text-xs text-gray-400 truncate">
            {developer.founded_year ? `Est. ${developer.founded_year} · ` : ''}{developer.total_projects_count} total projects
          </p>
        </div>
        <span className={`ml-2 text-[11px] font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap ${tier.color}`}>
          {tierLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => {
          let valueColor = 'text-gray-900'
          if (m.muted) valueColor = 'text-gray-400'
          else if (m.good) valueColor = 'text-emerald-700'
          return (
            <div key={m.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-base font-medium ${valueColor}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {profile.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] leading-relaxed">
          {profile.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-400 w-[88px] shrink-0">{label}</span>
              <span className="text-gray-900 truncate">{value}</span>
            </div>
          ))}
        </div>
      )}

      <ContactPills phone={phone} phoneHref={phoneHref} email={developer.email} websiteUrl={websiteUrl} />

      <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
        On-time delivery, RERA complaints/violations and historical ROI require source data we
        haven't ingested yet. Showing them as "0" or "100%" would be misleading.
      </p>
    </div>
  )
}


// ─── Contact pills ──────────────────────────────────────────
// Extracted into its own component so the parent's complexity stays under
// the SonarLint threshold. Each pill links via its native scheme (tel: /
// mailto:) when present and is hidden otherwise — no empty containers.

interface ContactPillsProps {
  phone:      string | null | undefined
  phoneHref:  string | null
  email:      string | null | undefined
  websiteUrl: string | null
}

function ContactPills({ phone, phoneHref, email, websiteUrl }: Readonly<ContactPillsProps>) {
  if (!phone && !email && !websiteUrl) return null
  const emailHref = email ? `mailto:${email}` : null
  let websiteLabel = ''
  if (websiteUrl) {
    try { websiteLabel = new URL(websiteUrl).hostname.replace(/^www\./, '') } catch { websiteLabel = websiteUrl }
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {phoneHref && phone && (
        <a href={phoneHref} className="inline-flex items-center gap-1.5 text-[12px] text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V8a1 1 0 01-.293.707L9.414 9.586a11.042 11.042 0 005 5l1.586-1.586A1 1 0 0117 12.5h2a1 1 0 011 1V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {phone}
        </a>
      )}
      {emailHref && email && (
        <a href={emailHref} className="inline-flex items-center gap-1.5 text-[12px] text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {email}
        </a>
      )}
      {websiteUrl && (
        <a href={websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full px-3 py-1.5 transition">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 015.656 0l1.768 1.768a4 4 0 010 5.656l-1.768 1.768a4 4 0 01-5.656 0l-1.06-1.061M10.172 13.828a4 4 0 01-5.656 0l-1.768-1.768a4 4 0 010-5.656L4.516 4.636a4 4 0 015.656 0l1.06 1.061" />
          </svg>
          {websiteLabel}
        </a>
      )}
    </div>
  )
}
