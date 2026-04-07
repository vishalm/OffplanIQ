// AI-powered market insights computed from real project data
// No LLM calls. Pure data-driven signals.

import type { Project } from '@offplaniq/shared'

interface Props {
  projects: any[]
}

function computeInsights(projects: any[]) {
  if (!projects.length) return null

  const withPsf = projects.filter(p => p.current_psf && p.launch_psf)
  const avgScore = Math.round(projects.reduce((s, p) => s + (p.score || 0), 0) / projects.length)
  const avgSellthrough = Math.round(projects.reduce((s, p) => s + (p.sellthrough_pct || 0), 0) / projects.length)

  // Top mover (biggest PSF gain)
  const topMover = withPsf
    .map(p => ({ ...p, delta: Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100) }))
    .sort((a, b) => b.delta - a.delta)[0]

  // Biggest riser in sell-through
  const hottest = [...projects].sort((a, b) => (b.sellthrough_pct || 0) - (a.sellthrough_pct || 0))[0]

  // Most delayed
  const mostDelayed = [...projects].sort((a, b) => (b.handover_delay_days || 0) - (a.handover_delay_days || 0))[0]

  // Area with highest avg PSF
  const areaMap = new Map<string, { total: number; count: number }>()
  for (const p of withPsf) {
    const entry = areaMap.get(p.area) || { total: 0, count: 0 }
    entry.total += p.current_psf
    entry.count++
    areaMap.set(p.area, entry)
  }
  const topArea = [...areaMap.entries()]
    .map(([area, { total, count }]) => ({ area, avg: Math.round(total / count) }))
    .sort((a, b) => b.avg - a.avg)[0]

  // Projects at risk (low score + delayed)
  const atRisk = projects.filter(p => p.score < 50 || (p.handover_delay_days > 180)).length

  // Strong buy signals (score > 85 + sell-through > 70)
  const strongBuy = projects.filter(p => p.score >= 85 && p.sellthrough_pct >= 70).length

  return { avgScore, avgSellthrough, topMover, hottest, mostDelayed, topArea, atRisk, strongBuy, total: projects.length }
}

export function MarketInsights({ projects }: Props) {
  const insights = computeInsights(projects)
  if (!insights) return null

  return (
    <div className="mb-6">
      {/* AI Signal Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Market Intelligence</h3>
          <span className="text-xs text-gray-400 ml-auto">Updated just now</span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {/* Strong buys */}
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-green-700">{insights.strongBuy}</p>
            <p className="text-xs text-green-600 mt-1">Strong buy signals</p>
            <p className="text-xs text-gray-400 mt-0.5">Score 85+ and sell-through 70%+</p>
          </div>

          {/* At risk */}
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-red-600">{insights.atRisk}</p>
            <p className="text-xs text-red-500 mt-1">Risk alerts</p>
            <p className="text-xs text-gray-400 mt-0.5">Score below 50 or 6mo+ delayed</p>
          </div>

          {/* Avg score */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-700">{insights.avgScore}</p>
            <p className="text-xs text-blue-600 mt-1">Average market score</p>
            <p className="text-xs text-gray-400 mt-0.5">Across {insights.total} tracked projects</p>
          </div>

          {/* Top area */}
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-sm font-bold text-purple-700">{insights.topArea?.area}</p>
            <p className="text-lg font-bold text-purple-700">AED {insights.topArea?.avg.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">Highest avg PSF area</p>
          </div>
        </div>
      </div>

      {/* Quick signals */}
      <div className="grid grid-cols-3 gap-3">
        {insights.topMover && (
          <a href={`/projects/${insights.topMover.slug}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-green-300 transition group">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Top Mover</span>
            </div>
            <p className="text-sm font-medium text-gray-900 group-hover:text-green-700 transition">{insights.topMover.name}</p>
            <p className="text-xs text-gray-500">{insights.topMover.developer?.name}</p>
            <p className="text-lg font-bold text-green-600 mt-1">+{insights.topMover.delta}%</p>
            <p className="text-xs text-gray-400">PSF growth since launch</p>
          </a>
        )}

        {insights.hottest && (
          <a href={`/projects/${insights.hottest.slug}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition group">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Highest Demand</span>
            </div>
            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition">{insights.hottest.name}</p>
            <p className="text-xs text-gray-500">{insights.hottest.developer?.name}</p>
            <p className="text-lg font-bold text-blue-600 mt-1">{insights.hottest.sellthrough_pct}%</p>
            <p className="text-xs text-gray-400">Sell-through rate</p>
          </a>
        )}

        {insights.mostDelayed && insights.mostDelayed.handover_delay_days > 0 && (
          <a href={`/projects/${insights.mostDelayed.slug}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-red-300 transition group">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Delay Alert</span>
            </div>
            <p className="text-sm font-medium text-gray-900 group-hover:text-red-700 transition">{insights.mostDelayed.name}</p>
            <p className="text-xs text-gray-500">{insights.mostDelayed.developer?.name}</p>
            <p className="text-lg font-bold text-red-600 mt-1">+{Math.round(insights.mostDelayed.handover_delay_days / 30)}mo</p>
            <p className="text-xs text-gray-400">Behind schedule</p>
          </a>
        )}
      </div>
    </div>
  )
}
