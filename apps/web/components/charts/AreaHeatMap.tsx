'use client'

// Area heat map - shows PSF and score intensity across areas
// Color-coded grid cells that glow based on performance

interface AreaData {
  area: string
  avgPsf: number
  avgScore: number
  count: number
  topProject: string
}

interface Props {
  projects: any[]
}

function computeAreaData(projects: any[]): AreaData[] {
  const map = new Map<string, { psfSum: number; scoreSum: number; count: number; topScore: number; topName: string }>()

  for (const p of projects) {
    const entry = map.get(p.area) || { psfSum: 0, scoreSum: 0, count: 0, topScore: 0, topName: '' }
    entry.psfSum += p.current_psf || 0
    entry.scoreSum += p.score || 0
    entry.count++
    if ((p.score || 0) > entry.topScore) {
      entry.topScore = p.score
      entry.topName = p.name
    }
    map.set(p.area, entry)
  }

  return [...map.entries()]
    .map(([area, d]) => ({
      area,
      avgPsf: Math.round(d.psfSum / d.count),
      avgScore: Math.round(d.scoreSum / d.count),
      count: d.count,
      topProject: d.topName,
    }))
    .filter(d => d.avgPsf > 0)
    .sort((a, b) => b.avgScore - a.avgScore)
}

function scoreColor(score: number): string {
  if (score >= 85) return 'from-green-500 to-green-600'
  if (score >= 70) return 'from-green-400 to-green-500'
  if (score >= 55) return 'from-amber-400 to-amber-500'
  if (score >= 40) return 'from-orange-400 to-orange-500'
  return 'from-red-400 to-red-500'
}

function scoreBg(score: number): string {
  if (score >= 85) return 'bg-green-50 border-green-200'
  if (score >= 70) return 'bg-green-50/50 border-green-100'
  if (score >= 55) return 'bg-amber-50 border-amber-100'
  if (score >= 40) return 'bg-orange-50 border-orange-100'
  return 'bg-red-50 border-red-100'
}

export function AreaHeatMap({ projects }: Props) {
  const areas = computeAreaData(projects)
  if (areas.length === 0) return null

  const maxPsf = Math.max(...areas.map(a => a.avgPsf))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/>
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Area Performance Heat Map</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {areas.map(area => (
          <div
            key={area.area}
            className={`relative rounded-lg border p-3 transition-all hover:scale-[1.02] cursor-default ${scoreBg(area.avgScore)}`}
          >
            {/* Intensity bar */}
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${scoreColor(area.avgScore)}`}
                style={{ width: `${(area.avgPsf / maxPsf) * 100}%` }}
              />
            </div>

            <p className="text-xs font-semibold text-gray-900 mt-1 truncate">{area.area}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold text-gray-900">{area.avgScore}</span>
              <span className="text-xs text-gray-400">/100</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">AED {area.avgPsf.toLocaleString()}/sqft</p>
            <p className="text-xs text-gray-400 mt-0.5">{area.count} project{area.count > 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100">
        {[
          { label: 'Buy zone', color: 'bg-green-500' },
          { label: 'Hold zone', color: 'bg-amber-500' },
          { label: 'Avoid zone', color: 'bg-red-500' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
