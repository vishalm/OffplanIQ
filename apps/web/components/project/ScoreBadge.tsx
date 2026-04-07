// apps/web/components/project/ScoreBadge.tsx
import type { ScoreBreakdown } from '@offplaniq/shared'
import { getScoreLabel } from '@/lib/scoring/algorithm'

const SIZE = {
  sm: 'text-sm px-2.5 py-1',
  md: 'text-base px-3 py-1.5',
  lg: 'text-xl px-4 py-2',
}

const COLORS: Record<string, string> = {
  excellent: 'bg-green-50 text-green-700',
  good:      'bg-green-50 text-green-600',
  watch:     'bg-amber-50 text-amber-700',
  caution:   'bg-orange-50 text-orange-700',
  avoid:     'bg-red-50 text-red-600',
}

export function ScoreBadge({
  score,
  size = 'md',
  breakdown,
}: {
  score: number
  size?: 'sm' | 'md' | 'lg'
  breakdown?: ScoreBreakdown | null
}) {
  const label = getScoreLabel(score)
  const color = COLORS[label]

  return (
    <span
      className={`inline-block font-medium rounded-lg tabular-nums ${SIZE[size]} ${color}`}
      title={breakdown
        ? `Sell-through: ${breakdown.sellthrough}/40 · PSF: ${breakdown.psf_delta}/30 · Developer: ${breakdown.developer}/20 · Handover: ${breakdown.handover}/10`
        : undefined}
    >
      {score}
    </span>
  )
}
