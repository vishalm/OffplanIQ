'use client'

interface Props {
  score: number
  size?: number
}

export function InvestmentGauge({ score, size = 140 }: Props) {
  const recommendation = score >= 85 ? 'Strong Buy' : score >= 70 ? 'Buy' : score >= 55 ? 'Hold' : score >= 40 ? 'Caution' : 'Avoid'
  const color = score >= 85 ? '#16a34a' : score >= 70 ? '#22c55e' : score >= 55 ? '#ca8a04' : score >= 40 ? '#ea580c' : '#dc2626'

  // Ring gauge (full circle, not semicircle)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 14
  const strokeW = 8
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={strokeW} />
          {/* Progress */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{score}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold" style={{ color }}>{recommendation}</span>
      </div>
    </div>
  )
}
