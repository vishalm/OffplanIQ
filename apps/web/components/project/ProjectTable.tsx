'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import type { SubscriptionTier } from '@offplaniq/shared'
import { ScoreBadge } from './ScoreBadge'

const PAGE_SIZE = 20

type SortKey = 'score' | 'psf' | 'growth' | 'sellthrough' | 'handover' | 'name'
type SortDir = 'asc' | 'desc'

interface Props {
  projects: any[]
  tier: SubscriptionTier
}

const columns: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: 'name', label: 'Project', defaultDir: 'asc' },
  { key: 'psf', label: 'PSF', defaultDir: 'desc' },
  { key: 'growth', label: 'Growth', defaultDir: 'desc' },
  { key: 'sellthrough', label: 'Sold', defaultDir: 'desc' },
  { key: 'handover', label: 'Handover', defaultDir: 'asc' },
  { key: 'score', label: 'Score', defaultDir: 'desc' },
]

function getGrowth(p: any): number | null {
  if (!p.launch_psf || !p.current_psf) return null
  return Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100)
}

function getSortValue(p: any, key: SortKey): number | string {
  switch (key) {
    case 'name': return (p.name || '').toLowerCase()
    case 'psf': return p.current_psf || 0
    case 'growth': return getGrowth(p) ?? -999
    case 'sellthrough': return p.sellthrough_pct || 0
    case 'handover': return p.current_handover_date || 'z'
    case 'score': return p.score || 0
  }
}

export function ProjectTable({ projects, tier }: Props) {
  const isFree = tier === 'free'
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  // Sort all projects in JS
  const sorted = useMemo(() => {
    const arr = [...projects]
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [projects, sortKey, sortDir])

  // Paginate
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = isFree ? sorted.slice(0, 20) : sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(columns.find(c => c.key === key)?.defaultDir ?? 'desc')
    }
    setPage(1)
  }

  if (!projects.length) {
    return (
      <div className="rounded-2xl bg-white p-16 text-center" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-sm text-gray-400">No projects match your filters.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Header */}
        <div className="grid grid-cols-[2.5fr_90px_80px_80px_90px_60px] gap-3 px-5 py-3 border-b border-gray-100">
          {columns.map(col => (
            <button key={col.key} onClick={() => handleSort(col.key)}
              className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-700 transition-colors flex items-center gap-1 text-left"
            >
              {col.label}
              {sortKey === col.key && (
                <span className="text-gray-800">{sortDir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        {paginated.map((project: any, i: number) => {
          const growth = getGrowth(project)
          const isBlurred = isFree && i >= 10

          return (
            <Link key={project.id} href={`/projects/${project.slug}`}
              className={`grid grid-cols-[2.5fr_90px_80px_80px_90px_60px] gap-3 items-center px-5 py-3 border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${isBlurred ? 'blur-sm pointer-events-none select-none' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate">{project.name}</p>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {project.developer?.name} · {project.area}
                </p>
              </div>

              <p className="text-[13px] font-medium text-gray-900 tabular-nums">
                {project.current_psf ? project.current_psf.toLocaleString() : '-'}
              </p>

              <p className={`text-[13px] font-semibold tabular-nums ${
                growth === null ? 'text-gray-300' : growth > 0 ? 'text-green-600' : growth < 0 ? 'text-red-500' : 'text-gray-400'
              }`}>
                {growth === null ? '-' : `${growth > 0 ? '+' : ''}${growth}%`}
              </p>

              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-gray-700 tabular-nums">{project.sellthrough_pct}%</span>
                <div className="flex-1 h-1 bg-gray-100 rounded-full max-w-[40px]">
                  <div className="h-1 rounded-full bg-gray-400" style={{ width: `${Math.min(project.sellthrough_pct, 100)}%` }} />
                </div>
              </div>

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

              <ScoreBadge score={project.score} size="sm" />
            </Link>
          )
        })}
      </div>

      {/* Pagination */}
      {!isFree && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-[12px] text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="text-[13px] font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-gray-300 px-1">...</span>}
                  <button onClick={() => setPage(p)}
                    className={`text-[13px] font-medium w-8 h-8 rounded-lg transition-colors ${
                      p === page ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-200'
                    }`}
                  >{p}</button>
                </span>
              ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="text-[13px] font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
