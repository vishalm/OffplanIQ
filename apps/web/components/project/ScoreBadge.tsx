import type { ScoreBreakdown } from '@offplaniq/shared'

type Label = 'excellent' | 'good' | 'watch' | 'caution' | 'avoid'

function getLabel(score: number): Label {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 55) return 'watch'
  if (score >= 40) return 'caution'
  return 'avoid'
}

const colors: Record<Label, string> = {
  excellent: 'bg-green-50 text-green-700 ring-green-600/10',
  good:      'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  watch:     'bg-amber-50 text-amber-700 ring-amber-600/10',
  caution:   'bg-orange-50 text-orange-700 ring-orange-600/10',
  avoid:     'bg-red-50 text-red-600 ring-red-600/10',
}

const sizes = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
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
  const label = getLabel(score)
  const tooltip = breakdown
    ? `Sell-through: ${breakdown.sellthrough}/40 · PSF: ${breakdown.psf_delta}/30 · Developer: ${breakdown.developer}/20 · Handover: ${breakdown.handover}/10`
    : undefined

  return (
    <span
      className={`inline-flex items-center rounded-full ring-1 font-semibold tabular-nums ${colors[label]} ${sizes[size]}`}
      title={tooltip}
    >
      {score}
    </span>
  )
}
