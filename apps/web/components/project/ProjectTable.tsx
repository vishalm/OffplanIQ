import Link from 'next/link'
import type { Project, SubscriptionTier } from '@offplaniq/shared'
import { ScoreBadge } from './ScoreBadge'

interface Props {
  projects: (Project & { developer?: { name: string; slug: string } })[]
  tier: SubscriptionTier
  sort?: string
  currentFilters?: Record<string, string | undefined>
}

const columns = [
  { key: 'name', label: 'Project', sortAsc: 'name', sortDesc: 'name' },
  { key: 'psf', label: 'PSF', sortAsc: 'psf_asc', sortDesc: 'psf' },
  { key: 'delta', label: 'Growth', sortAsc: 'psf_asc', sortDesc: 'psf' },
  { key: 'sellthrough', label: 'Sold', sortAsc: 'sellthrough_asc', sortDesc: 'sellthrough' },
  { key: 'handover', label: 'Handover', sortAsc: 'handover', sortDesc: 'handover' },
  { key: 'score', label: 'Score', sortAsc: 'score_asc', sortDesc: 'score' },
] as const

function sortUrl(col: typeof columns[number], current?: string, filters?: Record<string, string | undefined>) {
  const next = current === col.sortDesc ? col.sortAsc : col.sortDesc
  const params = new URLSearchParams()
  if (filters) for (const [k, v] of Object.entries(filters)) { if (v && k !== 'sort') params.set(k, v) }
  params.set('sort', next)
  return `/dashboard?${params.toString()}`
}

export function ProjectTable({ projects, tier, sort, currentFilters }: Props) {
  const isFree = tier === 'free'

  if (!projects.length) {
    return (
      <div className="rounded-2xl bg-white p-16 text-center" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-sm text-gray-400">No projects match your filters.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Header */}
      <div className="grid grid-cols-[2.5fr_90px_80px_80px_90px_60px] gap-3 px-5 py-3 border-b border-gray-100">
        {columns.map(col => (
          <Link
            key={col.key}
            href={sortUrl(col, sort, currentFilters)}
            className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            {col.label}
            {sort === col.sortDesc && <span className="text-gray-800">↓</span>}
            {sort === col.sortAsc && <span className="text-gray-800">↑</span>}
          </Link>
        ))}
      </div>

      {/* Rows */}
      {projects.map((project, i) => {
        const psfDelta = project.launch_psf && project.current_psf
          ? Math.round(((project.current_psf - project.launch_psf) / project.launch_psf) * 100) : null
        const isBlurred = isFree && i >= 10

        return (
          <Link
            key={project.id}
            href={`/projects/${project.slug}`}
            className={`grid grid-cols-[2.5fr_90px_80px_80px_90px_60px] gap-3 items-center px-5 py-3 border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${isBlurred ? 'blur-sm pointer-events-none select-none' : ''}`}
          >
            {/* Project */}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-900 truncate">{project.name}</p>
              <p className="text-[11px] text-gray-400 truncate mt-0.5">
                {project.developer?.name} · {project.area}
              </p>
            </div>

            {/* PSF */}
            <p className="text-[13px] font-medium text-gray-900 tabular-nums">
              {project.current_psf ? project.current_psf.toLocaleString() : '-'}
            </p>

            {/* Growth */}
            <p className={`text-[13px] font-semibold tabular-nums ${
              psfDelta === null ? 'text-gray-300' : psfDelta > 0 ? 'text-green-600' : psfDelta < 0 ? 'text-red-500' : 'text-gray-400'
            }`}>
              {psfDelta === null ? '-' : `${psfDelta > 0 ? '+' : ''}${psfDelta}%`}
            </p>

            {/* Sold */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-gray-700 tabular-nums">{project.sellthrough_pct}%</span>
              <div className="flex-1 h-1 bg-gray-100 rounded-full max-w-[40px]">
                <div className="h-1 rounded-full bg-gray-400" style={{ width: `${Math.min(project.sellthrough_pct, 100)}%` }} />
              </div>
            </div>

            {/* Handover */}
            <div>
              <p className="text-[12px] text-gray-500">
                {project.current_handover_date
                  ? new Date(project.current_handover_date).toLocaleDateString('en-AE', { month: 'short', year: '2-digit' })
                  : '-'}
              </p>
              {project.handover_delay_days > 0 && (
                <p className="text-[10px] text-red-400 font-medium">+{Math.round(project.handover_delay_days / 30)}mo</p>
              )}
            </div>

            {/* Score */}
            <ScoreBadge score={project.score} size="sm" />
          </Link>
        )
      })}
    </div>
  )
}
