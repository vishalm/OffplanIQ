'use client'

interface Props {
  score: number
  size?: number
}

export function InvestmentGauge({ score, size = 160 }: Props) {
  const recommendation = score >= 85 ? 'Strong Buy' : score >= 70 ? 'Buy' : score >= 55 ? 'Hold' : score >= 40 ? 'Caution' : 'Avoid'
  const color = score >= 85 ? '#16a34a' : score >= 70 ? '#22c55e' : score >= 55 ? '#ca8a04' : score >= 40 ? '#ea580c' : '#dc2626'
  const bgColor = score >= 85 ? '#f0fdf4' : score >= 70 ? '#f0fdf4' : score >= 55 ? '#fefce8' : score >= 40 ? '#fff7ed' : '#fef2f2'

  // SVG arc math
  const cx = size / 2, cy = size / 2 + 5
  const r = size / 2 - 16
  const strokeW = 10
  const circumference = Math.PI * r // semicircle
  const progress = (score / 100) * circumference

  function describeArc(pct: number): string {
    const angle = -180 + (pct / 100) * 180
    const rad = (angle * Math.PI) / 180
    const x = cx + r * Math.cos(rad)
    const y = cy + r * Math.sin(rad)
    const startX = cx + r * Math.cos(-Math.PI)
    const startY = cy + r * Math.sin(-Math.PI)
    const large = pct > 50 ? 1 : 0
    return `M ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${x} ${y}`
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Track */}
        <path d={describeArc(100)} fill="none" stroke="#f0f0f0" strokeWidth={strokeW} strokeLinecap="round" />
        {/* Progress */}
        <path d={describeArc(score)} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        {/* Score */}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="32" fontWeight="700" fill="#111" fontFamily="system-ui">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#999" fontFamily="system-ui">out of 100</text>
      </svg>
      <div className="flex items-center gap-1.5 -mt-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold" style={{ color }}>{recommendation}</span>
      </div>
    </div>
  )
}
