'use client'

// Investment gauge meter - Buy / Hold / Avoid visual indicator
// SVG-based semicircular gauge with animated needle

interface Props {
  score: number // 0-100
  size?: number
}

export function InvestmentGauge({ score, size = 220 }: Props) {
  const cx = size / 2
  const cy = size / 2 + 10
  const r = size / 2 - 20

  // Score to angle: 0 = -180deg (far left), 100 = 0deg (far right)
  const angle = -180 + (score / 100) * 180
  const needleRad = (angle * Math.PI) / 180
  const needleLen = r - 15
  const nx = cx + needleLen * Math.cos(needleRad)
  const ny = cy + needleLen * Math.sin(needleRad)

  // Arc segments: Avoid (0-39), Caution (40-54), Hold (55-69), Good (70-84), Buy (85-100)
  const segments = [
    { start: 0, end: 39, color: '#ef4444', label: 'Avoid' },
    { start: 40, end: 54, color: '#f97316', label: 'Caution' },
    { start: 55, end: 69, color: '#eab308', label: 'Hold' },
    { start: 70, end: 84, color: '#22c55e', label: 'Good' },
    { start: 85, end: 100, color: '#16a34a', label: 'Buy' },
  ]

  function arcPath(startPct: number, endPct: number): string {
    const startAngle = -180 + (startPct / 100) * 180
    const endAngle = -180 + (endPct / 100) * 180
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const large = endAngle - startAngle > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const recommendation = score >= 85 ? 'Strong Buy' : score >= 70 ? 'Buy' : score >= 55 ? 'Hold' : score >= 40 ? 'Caution' : 'Avoid'
  const recColor = score >= 85 ? '#16a34a' : score >= 70 ? '#22c55e' : score >= 55 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444'

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 40} viewBox={`0 0 ${size} ${size / 2 + 50}`}>
        {/* Background arc */}
        <path d={arcPath(0, 100)} fill="none" stroke="#f3f4f6" strokeWidth="18" strokeLinecap="round" />

        {/* Colored segments */}
        {segments.map(seg => (
          <path
            key={seg.label}
            d={arcPath(seg.start, seg.end)}
            fill="none"
            stroke={seg.color}
            strokeWidth="18"
            strokeLinecap="butt"
            opacity={0.85}
          />
        ))}

        {/* Tick marks */}
        {[0, 20, 40, 60, 80, 100].map(tick => {
          const a = (-180 + (tick / 100) * 180) * Math.PI / 180
          const x1 = cx + (r - 12) * Math.cos(a)
          const y1 = cy + (r - 12) * Math.sin(a)
          const x2 = cx + (r + 4) * Math.cos(a)
          const y2 = cy + (r + 4) * Math.sin(a)
          return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth="1.5" />
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="#1f2937" strokeWidth="3" strokeLinecap="round"
          style={{ transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <circle cx={cx} cy={cy} r="6" fill="#1f2937" />
        <circle cx={cx} cy={cy} r="3" fill="white" />

        {/* Score text */}
        <text x={cx} y={cy - 20} textAnchor="middle" fontSize="36" fontWeight="700" fill="#111827">
          {score}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fill="#9ca3af">
          out of 100
        </text>

        {/* Labels */}
        <text x={18} y={cy + 20} fontSize="10" fill="#ef4444" fontWeight="600">AVOID</text>
        <text x={size - 42} y={cy + 20} fontSize="10" fill="#16a34a" fontWeight="600">BUY</text>
      </svg>

      <div className="flex items-center gap-2 -mt-2">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: recColor }} />
        <span className="text-sm font-bold" style={{ color: recColor }}>
          {recommendation}
        </span>
      </div>
    </div>
  )
}
