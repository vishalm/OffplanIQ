// apps/web/components/project/ProjectTable.tsx
// The main sortable project table on the dashboard

import Link from 'next/link'
import type { Project, SubscriptionTier } from '@offplaniq/shared'
import { ScoreBadge } from './ScoreBadge'

interface Props {
  projects: (Project & { developer?: { name: string; slug: string } })[]
  tier: SubscriptionTier
  sort?: string
}

export function ProjectTable({ projects, tier, sort }: Props) {
  const isFree = tier === 'free'

  if (!projects.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <p className="text-gray-400 text-sm">No projects match your filters.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2fr_100px_100px_110px_100px_80px] gap-3 px-4 py-3 border-b border-gray-100">
        {['Project', 'PSF', '6m delta', 'Sell-thru', 'Handover', 'Score'].map(col => (
          <span key={col} className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {projects.map((project, i) => {
        const psfDelta = project.launch_psf && project.current_psf
          ? Math.round(((project.current_psf - project.launch_psf) / project.launch_psf) * 100)
          : null

        const isBlurred = isFree && i >= 10 // blur rows 10-19 on free tier

        return (
          <Link
            key={project.id}
            href={`/projects/${project.slug}`}
            className={`grid grid-cols-[2fr_100px_100px_110px_100px_80px] gap-3 items-center px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition last:border-0 ${isBlurred ? 'blur-sm pointer-events-none select-none' : ''}`}
          >
            {/* Project name */}
            <div>
              <p className="text-sm font-medium text-gray-900">{project.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {project.developer?.name} · {project.area}
              </p>
              <HandoverBadge status={project.handover_status} />
            </div>

            {/* PSF */}
            <span className="text-sm font-medium text-gray-900">
              {project.current_psf ? `AED ${project.current_psf.toLocaleString()}` : '—'}
            </span>

            {/* 6m delta */}
            <span className={`text-sm font-medium ${
              psfDelta === null ? 'text-gray-400' :
              psfDelta > 0 ? 'text-green-600' : 'text-red-500'
            }`}>
              {psfDelta === null ? '—' : `${psfDelta > 0 ? '+' : ''}${psfDelta}%`}
            </span>

            {/* Sell-through */}
            <div>
              <p className="text-sm text-gray-700">{project.sellthrough_pct}%</p>
              <div className="mt-1 h-1 bg-gray-100 rounded-full w-16">
                <div
                  className="h-1 rounded-full bg-gray-400"
                  style={{ width: `${project.sellthrough_pct}%` }}
                />
              </div>
            </div>

            {/* Handover */}
            <span className="text-xs text-gray-500">
              {project.current_handover_date
                ? new Date(project.current_handover_date).toLocaleDateString('en-AE', { month: 'short', year: '2-digit' })
                : '—'}
              {project.handover_delay_days > 0 && (
                <span className="block text-red-400">+{Math.round(project.handover_delay_days / 30)}mo delay</span>
              )}
            </span>

            {/* Score */}
            <ScoreBadge score={project.score} size="sm" />
          </Link>
        )
      })}

      {isFree && projects.length >= 10 && (
        <div className="px-4 py-4 border-t border-gray-100 bg-gray-50 text-center">
          <p className="text-sm text-gray-500">
            Showing 10 of 142+ projects.{' '}
            <a href="/settings/billing" className="text-gray-900 font-medium underline">
              Upgrade to Investor to unlock all →
            </a>
          </p>
        </div>
      )}
    </div>
  )
}

function HandoverBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    on_track:  'text-green-600 bg-green-50',
    at_risk:   'text-amber-600 bg-amber-50',
    delayed:   'text-red-600 bg-red-50',
    completed: 'text-gray-500 bg-gray-100',
  }
  const labels: Record<string, string> = {
    on_track:  'On track',
    at_risk:   'At risk',
    delayed:   'Delayed',
    completed: 'Handed over',
  }
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${styles[status] ?? 'text-gray-400 bg-gray-100'}`}>
      {labels[status] ?? status}
    </span>
  )
}
