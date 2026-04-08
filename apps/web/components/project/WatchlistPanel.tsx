// apps/web/components/project/WatchlistPanel.tsx
import Link from 'next/link'
import { ScoreBadge } from './ScoreBadge'

interface WatchlistEntry {
  id: string
  project?: {
    id: string
    name: string
    slug: string
    area: string
    score: number
    current_psf: number | null
    sellthrough_pct: number
    handover_status: string
  }
}

export function WatchlistPanel({
  entries,
  userId,
}: {
  entries: WatchlistEntry[]
  userId: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Watchlist · {entries.length}
        </p>
        <Link href="/search" className="text-xs text-gray-500 hover:text-gray-900">
          + Add
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400">No projects watched yet</p>
          <Link href="/search" className="text-xs text-gray-900 underline mt-1 inline-block">
            Browse projects
          </Link>
        </div>
      ) : (
        <div>
          {entries.map(entry => {
            const p = entry.project
            if (!p) return null
            return (
              <Link
                key={entry.id}
                href={`/projects/${p.slug}`}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.area} · {p.sellthrough_pct}% sold</p>
                </div>
                <ScoreBadge score={p.score} size="sm" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
