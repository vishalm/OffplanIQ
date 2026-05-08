'use client'

// apps/web/components/ai/ToolResultCard.tsx
// Phase 5.5 — renders tool invocations as collapsible inline cards.
// Each tool gets a tailored summary (project list, comparison table, IRR
// widget, update feed). Falling back to JSON ensures we never go silent
// even if the schema evolves.

import { useState } from 'react'
import Link from 'next/link'

type Project = {
  name: string
  slug: string
  area?: string | null
  city?: string | null
  total_units?: number | null
  units_sold?: number | null
  sellthrough_pct?: number | null
  current_psf?: number | null
  launch_psf?: number | null
  min_price?: number | null
  max_price?: number | null
  score?: number | null
  current_handover_date?: string | null
  handover_status?: string | null
  developer?: { name?: string | null; slug?: string | null } | null
}

interface Props {
  name: string
  args: any
  result: any
}

export function ToolResultCard({ name, args, result }: Props) {
  const [open, setOpen] = useState(false)
  if (!result || result.ok === false) {
    return (
      <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok={false}>
        <p className="text-[13px] text-red-500 px-4 pb-3">
          {result?.error || 'Tool error'}
        </p>
      </Wrapper>
    )
  }

  const data = result.data || result

  if (name === 'search_projects' || name === 'find_similar_projects') {
    const projects: Project[] = data.projects ?? []
    return (
      <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok>
        <ProjectGrid projects={projects} />
      </Wrapper>
    )
  }

  if (name === 'compare_projects') {
    const projects: Project[] = data.projects ?? []
    return (
      <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok>
        <ComparisonTable projects={projects} />
      </Wrapper>
    )
  }

  if (name === 'compute_irr') {
    return (
      <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok>
        <IrrWidget data={data} />
      </Wrapper>
    )
  }

  if (name === 'recent_updates') {
    return (
      <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok>
        <UpdateFeed updates={data.updates ?? []} />
      </Wrapper>
    )
  }

  // Fallback: pretty-printed JSON.
  return (
    <Wrapper name={name} args={args} open={open} setOpen={setOpen} ok>
      <pre className="text-[11.5px] text-gray-600 px-4 pb-3 overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(data, null, 2).slice(0, 4000)}
      </pre>
    </Wrapper>
  )
}


function Wrapper({
  name, args, ok, open, setOpen, children,
}: {
  name: string
  args: any
  ok: boolean
  open: boolean
  setOpen: (v: boolean) => void
  children: React.ReactNode
}) {
  const argsSummary = summariseArgs(args)
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50 transition"
      >
        <ToolIcon name={name} ok={ok} />
        <span className="text-[12.5px] font-medium text-gray-900">{prettyName(name)}</span>
        {argsSummary && <span className="text-[12px] text-gray-500 truncate flex-1">· {argsSummary}</span>}
        <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  )
}


function ProjectGrid({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <p className="text-[13px] text-gray-500 px-4 py-3">No matches.</p>
  }
  return (
    <ul className="divide-y divide-gray-100">
      {projects.map(p => (
        <li key={p.slug} className="px-4 py-3 hover:bg-gray-50 transition">
          <Link href={`/projects/${p.slug}`} className="flex items-start justify-between gap-3 group">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition">{p.name}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                {[p.developer?.name, p.area, p.city].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div className="text-right shrink-0">
              {p.score != null && (
                <p className={`text-[13px] font-semibold ${scoreColor(p.score)}`}>{p.score}<span className="text-[11px] text-gray-400 font-normal">/100</span></p>
              )}
              <p className="text-[11.5px] text-gray-500">
                {p.min_price ? `from ${formatAed(p.min_price)}` : '—'}
                {p.current_psf ? ` · ${p.current_psf.toLocaleString()} PSF` : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}


function ComparisonTable({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <p className="text-[13px] text-gray-500 px-4 py-3">No projects matched.</p>
  }
  const cols: Array<{ label: string; render: (p: Project) => React.ReactNode }> = [
    { label: 'Score',     render: p => p.score != null ? <span className={scoreColor(p.score)}>{p.score}</span> : '—' },
    { label: 'PSF',       render: p => p.current_psf ? p.current_psf.toLocaleString() : '—' },
    { label: 'From',      render: p => p.min_price ? formatAed(p.min_price) : '—' },
    { label: 'Sold %',    render: p => p.sellthrough_pct != null ? `${p.sellthrough_pct}%` : '—' },
    { label: 'Handover',  render: p => p.current_handover_date?.slice(0, 7) || '—' },
    { label: 'Developer', render: p => p.developer?.name || '—' },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2">Field</th>
            {projects.map(p => (
              <th key={p.slug} className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium px-3 py-2 truncate max-w-[140px]">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map(col => (
            <tr key={col.label} className="border-t border-gray-100">
              <td className="px-4 py-2 text-gray-500">{col.label}</td>
              {projects.map(p => (
                <td key={p.slug} className="px-3 py-2 text-gray-900 font-medium tabular-nums">{col.render(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


function IrrWidget({ data }: { data: any }) {
  const r = data?.result ?? {}
  const a = data?.assumptions ?? {}
  const p = data?.project ?? {}
  return (
    <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
      <Metric label="IRR (annualised)" value={r.annualised_irr != null ? `${r.annualised_irr.toFixed(1)}%` : '—'} highlight />
      <Metric label="Total return" value={r.total_return_pct != null ? `${(r.total_return_pct * 100).toFixed(1)}%` : '—'} />
      <Metric label="Exit PSF" value={a.exit_psf_aed ? `AED ${a.exit_psf_aed.toLocaleString()}` : '—'} />
      <Metric label="Hold" value={a.hold_years ? `${a.hold_years} yr` : '—'} />
      <div className="col-span-full text-left text-[12px] text-gray-500 pt-2 border-t border-gray-100">
        <span className="font-medium text-gray-700">{p.name || 'Project'}</span>
        {' · '}
        starting {p.min_price ? formatAed(p.min_price) : '—'}
        {' · '}
        plan: {a.payment_plan?.name || '—'}
      </div>
    </div>
  )
}


function UpdateFeed({ updates }: { updates: any[] }) {
  if (updates.length === 0) {
    return <p className="text-[13px] text-gray-500 px-4 py-3">No recent updates.</p>
  }
  return (
    <ul className="divide-y divide-gray-100">
      {updates.map((u, i) => (
        <li key={u.id ?? i} className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full ${changeColor(u.change_type)}`}>{u.change_type?.replace('_', ' ') || 'update'}</span>
            <Link href={`/projects/${u.project_slug || u.project?.slug || ''}`} className="text-[13px] font-medium text-gray-900 hover:text-blue-600 truncate">
              {u.project_name || u.project?.name || 'Project'}
            </Link>
          </div>
          {u.field && (
            <p className="text-[12px] text-gray-500 mt-1">
              <span className="text-gray-700">{u.field}</span>
              {': '}
              <span className="line-through text-gray-400">{prettyVal(u.before_value)}</span>
              {' → '}
              <span className="text-gray-900">{prettyVal(u.after_value)}</span>
              {u.delta_pct != null && <span className={`ml-2 ${u.delta_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>({u.delta_pct >= 0 ? '+' : ''}{u.delta_pct}%)</span>}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}


function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className={`tabular-nums font-semibold ${highlight ? 'text-2xl text-blue-600' : 'text-base text-gray-900'}`}>{value}</p>
      <p className="text-[10.5px] uppercase tracking-widest text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}


function ToolIcon({ name, ok }: { name: string; ok: boolean }) {
  const color = ok ? 'text-blue-600' : 'text-red-500'
  const path = (() => {
    if (name === 'compute_irr')           return 'M3 3v18h18M7 14l4-4 4 4 4-8'
    if (name === 'compare_projects')      return 'M9 5h12M9 12h12M9 19h12M5 5h0M5 12h0M5 19h0'
    if (name === 'recent_updates')        return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
    if (name === 'find_similar_projects') return 'M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z'
    return 'M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z'
  })()
  return (
    <svg className={`w-3.5 h-3.5 ${color} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}


// ─── helpers ───
function prettyName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function summariseArgs(args: any): string {
  if (!args || typeof args !== 'object') return ''
  const pairs: string[] = []
  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue
    pairs.push(`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    if (pairs.join(' · ').length > 80) break
  }
  return pairs.join(' · ')
}

function formatAed(n: number): string {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `AED ${Math.round(n / 1_000)}K`
  return `AED ${n}`
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-emerald-600'
  if (score >= 55) return 'text-amber-600'
  return 'text-red-600'
}

function changeColor(type?: string | null): string {
  switch (type) {
    case 'launch':            return 'bg-blue-50 text-blue-700'
    case 'price_change':      return 'bg-amber-50 text-amber-700'
    case 'handover_change':   return 'bg-orange-50 text-orange-700'
    case 'units_change':      return 'bg-violet-50 text-violet-700'
    default:                  return 'bg-gray-100 text-gray-600'
  }
}

function prettyVal(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  if (Array.isArray(v))      return v.join(', ')
  return String(v)
}
