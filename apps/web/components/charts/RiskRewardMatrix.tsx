'use client'

// Risk vs Reward scatter plot - visual quadrant chart
// X = Risk (inverse of score), Y = Reward (PSF growth %)
// Projects plotted as bubbles, sized by sell-through

interface Props {
  projects: any[]
  currentSlug?: string
}

export function RiskRewardMatrix({ projects, currentSlug }: Props) {
  const data = projects
    .filter(p => p.current_psf && p.launch_psf && p.score)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      risk: 100 - p.score, // lower score = higher risk
      reward: Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100),
      sellthrough: p.sellthrough_pct || 0,
      isCurrent: p.slug === currentSlug,
    }))

  if (data.length < 3) return null

  const W = 500, H = 300
  const pad = { top: 30, right: 30, bottom: 40, left: 50 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom

  const maxRisk = Math.max(...data.map(d => d.risk), 60)
  const maxReward = Math.max(...data.map(d => d.reward), 30)
  const minReward = Math.min(...data.map(d => d.reward), -10)

  const scaleX = (v: number) => pad.left + (v / maxRisk) * plotW
  const scaleY = (v: number) => pad.top + plotH - ((v - minReward) / (maxReward - minReward)) * plotH

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Risk vs Reward Matrix</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">Bubble size = sell-through %. Top-left = best risk-adjusted returns.</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
        {/* Quadrant backgrounds */}
        <rect x={pad.left} y={pad.top} width={plotW / 2} height={plotH / 2} fill="#f0fdf4" opacity="0.5" />
        <rect x={pad.left + plotW / 2} y={pad.top} width={plotW / 2} height={plotH / 2} fill="#fef9c3" opacity="0.3" />
        <rect x={pad.left} y={pad.top + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#fef3c7" opacity="0.3" />
        <rect x={pad.left + plotW / 2} y={pad.top + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#fef2f2" opacity="0.5" />

        {/* Quadrant labels */}
        <text x={pad.left + 8} y={pad.top + 18} fontSize="9" fill="#16a34a" fontWeight="600" opacity="0.7">LOW RISK / HIGH REWARD</text>
        <text x={pad.left + plotW / 2 + 8} y={pad.top + plotH - 8} fontSize="9" fill="#dc2626" fontWeight="600" opacity="0.7">HIGH RISK / LOW REWARD</text>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(tick => {
          const x = scaleX((tick / 100) * maxRisk)
          return <line key={`gx-${tick}`} x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke="#e5e7eb" strokeWidth="0.5" />
        })}

        {/* Zero line for reward */}
        {minReward < 0 && (
          <line x1={pad.left} y1={scaleY(0)} x2={pad.left + plotW} y2={scaleY(0)} stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 4" />
        )}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#d1d5db" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#d1d5db" strokeWidth="1" />

        {/* Axis labels */}
        <text x={pad.left + plotW / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500">Risk Level →</text>
        <text x={12} y={pad.top + plotH / 2} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500" transform={`rotate(-90, 12, ${pad.top + plotH / 2})`}>Reward (PSF %) →</text>

        {/* Data points */}
        {data.map((d, i) => {
          const x = scaleX(d.risk)
          const y = scaleY(d.reward)
          const r = Math.max(4, Math.min(18, d.sellthrough / 5))
          const color = d.isCurrent ? '#2563eb' : d.reward > 10 && d.risk < 30 ? '#16a34a' : d.reward < 0 ? '#ef4444' : '#6b7280'

          return (
            <g key={i}>
              <circle
                cx={x} cy={y} r={r}
                fill={color} opacity={d.isCurrent ? 0.9 : 0.4}
                stroke={d.isCurrent ? '#1d4ed8' : 'none'}
                strokeWidth={d.isCurrent ? 2.5 : 0}
              />
              {d.isCurrent && (
                <>
                  <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#2563eb" strokeWidth="1.5" opacity="0.3" />
                  <text x={x} y={y - r - 6} textAnchor="middle" fontSize="10" fill="#1d4ed8" fontWeight="600">
                    {d.name.length > 20 ? d.name.slice(0, 18) + '...' : d.name}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 opacity-50" />
          <span className="text-xs text-gray-500">Sweet spot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-500 opacity-50" />
          <span className="text-xs text-gray-500">Moderate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 opacity-50" />
          <span className="text-xs text-gray-500">Underperforming</span>
        </div>
        {currentSlug && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-blue-300" />
            <span className="text-xs text-blue-700 font-medium">This project</span>
          </div>
        )}
      </div>
    </div>
  )
}
