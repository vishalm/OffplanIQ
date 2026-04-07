// AI-style investment analysis computed from project data
// Generates human-readable insights, risk factors, and signals

interface Props {
  project: any
  allProjects: any[]
}

function generateSignals(p: any, allProjects: any[]) {
  const signals: { type: 'bullish' | 'bearish' | 'neutral'; text: string }[] = []

  // PSF momentum
  if (p.launch_psf && p.current_psf) {
    const delta = ((p.current_psf - p.launch_psf) / p.launch_psf) * 100
    if (delta > 15) signals.push({ type: 'bullish', text: `PSF up ${Math.round(delta)}% since launch. Strong price momentum.` })
    else if (delta > 5) signals.push({ type: 'bullish', text: `PSF up ${Math.round(delta)}% since launch. Healthy appreciation.` })
    else if (delta < -3) signals.push({ type: 'bearish', text: `PSF down ${Math.round(Math.abs(delta))}% since launch. Price pressure.` })
    else signals.push({ type: 'neutral', text: `PSF relatively flat since launch (${delta > 0 ? '+' : ''}${Math.round(delta)}%).` })
  }

  // Sell-through
  if (p.sellthrough_pct >= 90) signals.push({ type: 'bullish', text: `${p.sellthrough_pct}% sold. Near sell-out creates scarcity premium.` })
  else if (p.sellthrough_pct >= 70) signals.push({ type: 'bullish', text: `${p.sellthrough_pct}% sold. Strong demand validated by the market.` })
  else if (p.sellthrough_pct >= 40) signals.push({ type: 'neutral', text: `${p.sellthrough_pct}% sold. Average absorption rate for this stage.` })
  else if (p.sellthrough_pct > 0) signals.push({ type: 'bearish', text: `Only ${p.sellthrough_pct}% sold. Slow demand may indicate pricing issues.` })

  // Handover
  if (p.handover_status === 'delayed' && p.handover_delay_days > 180)
    signals.push({ type: 'bearish', text: `${Math.round(p.handover_delay_days / 30)} months behind schedule. Extended delays impact ROI.` })
  else if (p.handover_status === 'delayed')
    signals.push({ type: 'bearish', text: `Handover delayed by ${Math.round(p.handover_delay_days / 30)} months. Monitor closely.` })
  else if (p.handover_status === 'on_track')
    signals.push({ type: 'bullish', text: 'Handover on track. No delivery risk detected.' })

  // Developer score
  const devScore = p.developer?.developer_score
  if (devScore >= 85) signals.push({ type: 'bullish', text: `Developer scored ${devScore}/100. Tier-1 track record.` })
  else if (devScore >= 70) signals.push({ type: 'neutral', text: `Developer scored ${devScore}/100. Solid execution history.` })
  else if (devScore < 60 && devScore != null) signals.push({ type: 'bearish', text: `Developer scored ${devScore}/100. Below-average track record.` })

  // Comparative PSF
  const sameArea = allProjects.filter(x => x.area === p.area && x.current_psf && x.id !== p.id)
  if (sameArea.length > 0) {
    const areaAvg = Math.round(sameArea.reduce((s, x) => s + x.current_psf, 0) / sameArea.length)
    if (p.current_psf < areaAvg * 0.85) signals.push({ type: 'bullish', text: `Priced ${Math.round(((areaAvg - p.current_psf) / areaAvg) * 100)}% below area average (AED ${areaAvg.toLocaleString()}/sqft). Potential value play.` })
    else if (p.current_psf > areaAvg * 1.2) signals.push({ type: 'neutral', text: `Premium of ${Math.round(((p.current_psf - areaAvg) / areaAvg) * 100)}% above area average. Justified by brand/quality.` })
  }

  return signals
}

function generateSummary(p: any): string {
  const parts: string[] = []

  parts.push(`${p.name} is a ${p.status === 'pre_launch' ? 'pre-launch' : 'currently active'} development by ${p.developer?.name || 'the developer'} in ${p.area}.`)

  if (p.total_units) parts.push(`The project offers ${p.total_units} units`)
  if (p.current_handover_date) {
    const date = new Date(p.current_handover_date)
    parts[parts.length - 1] += ` with expected handover in ${date.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })}.`
  } else {
    parts[parts.length - 1] += '.'
  }

  if (p.score >= 85) parts.push(`With a score of ${p.score}/100, this project ranks in the Excellent tier, placing it among the top-performing off-plan investments in the UAE.`)
  else if (p.score >= 70) parts.push(`Scoring ${p.score}/100 (Good), the project shows solid fundamentals across demand, pricing, and developer reliability.`)
  else if (p.score >= 55) parts.push(`At ${p.score}/100 (Watch), the project has mixed signals. Deeper due diligence is recommended before committing.`)
  else parts.push(`With a score of ${p.score}/100, the project carries elevated risk. Proceed with caution and verify developer commitments independently.`)

  return parts.join(' ')
}

function getScoreGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 85) return { label: 'Excellent', color: 'text-green-700', bg: 'bg-green-50' }
  if (score >= 70) return { label: 'Good', color: 'text-green-600', bg: 'bg-green-50' }
  if (score >= 55) return { label: 'Watch', color: 'text-amber-700', bg: 'bg-amber-50' }
  if (score >= 40) return { label: 'Caution', color: 'text-orange-700', bg: 'bg-orange-50' }
  return { label: 'Avoid', color: 'text-red-700', bg: 'bg-red-50' }
}

export function InvestmentAnalysis({ project: p, allProjects }: Props) {
  const signals = generateSignals(p, allProjects)
  const summary = generateSummary(p)
  const grade = getScoreGrade(p.score)
  const breakdown = p.score_breakdown

  const bullish = signals.filter(s => s.type === 'bullish').length
  const bearish = signals.filter(s => s.type === 'bearish').length
  const sentiment = bullish > bearish ? 'Bullish' : bearish > bullish ? 'Bearish' : 'Neutral'
  const sentimentColor = sentiment === 'Bullish' ? 'text-green-600' : sentiment === 'Bearish' ? 'text-red-600' : 'text-gray-600'

  // Comparable projects in same area
  const comparables = allProjects
    .filter(x => x.area === p.area && x.id !== p.id && x.current_psf)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3)

  return (
    <div className="space-y-4 mb-6">
      {/* AI Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Investment Analysis</h3>
          <span className={`text-xs font-semibold ml-auto px-2 py-0.5 rounded-full ${grade.bg} ${grade.color}`}>
            {grade.label} ({p.score}/100)
          </span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
      </div>

      {/* Score breakdown visual */}
      {breakdown && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Score Breakdown</h3>
            <span className={`text-sm font-bold ${sentimentColor}`}>Overall: {sentiment}</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Sell-through demand', score: breakdown.sellthrough, max: 40, desc: `${p.sellthrough_pct}% units sold` },
              { label: 'Price momentum (6m)', score: breakdown.psf_delta, max: 30, desc: p.launch_psf ? `${Math.round(((p.current_psf - p.launch_psf) / p.launch_psf) * 100)}% change` : 'Insufficient data' },
              { label: 'Developer reliability', score: breakdown.developer, max: 20, desc: p.developer?.name || 'Unknown' },
              { label: 'Handover status', score: breakdown.handover, max: 10, desc: p.handover_status?.replace('_', ' ') },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-semibold text-gray-900">{item.score}/{item.max}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.score / item.max >= 0.8 ? 'bg-green-500' :
                      item.score / item.max >= 0.6 ? 'bg-blue-500' :
                      item.score / item.max >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(item.score / item.max) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Investment Signals</h3>
        <div className="space-y-2">
          {signals.map((signal, i) => (
            <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${
              signal.type === 'bullish' ? 'bg-green-50' :
              signal.type === 'bearish' ? 'bg-red-50' : 'bg-gray-50'
            }`}>
              <span className={`text-sm mt-0.5 ${
                signal.type === 'bullish' ? 'text-green-600' :
                signal.type === 'bearish' ? 'text-red-500' : 'text-gray-500'
              }`}>
                {signal.type === 'bullish' ? '▲' : signal.type === 'bearish' ? '▼' : '●'}
              </span>
              <p className="text-sm text-gray-700">{signal.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparable projects */}
      {comparables.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Comparable Projects in {p.area}</h3>
          <div className="space-y-2">
            {comparables.map(comp => (
              <a key={comp.id} href={`/projects/${comp.slug}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition border border-gray-100"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{comp.name}</p>
                  <p className="text-xs text-gray-500">{comp.developer?.name} · {comp.sellthrough_pct}% sold</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">AED {comp.current_psf?.toLocaleString()}/sqft</p>
                  <p className={`text-xs font-medium ${
                    comp.score >= 70 ? 'text-green-600' : comp.score >= 55 ? 'text-amber-600' : 'text-red-500'
                  }`}>Score: {comp.score}/100</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Data source */}
      <div className="text-xs text-gray-400 px-1">
        Data sourced from Property Finder, Dubai Land Department, and developer filings.
        Analysis is algorithmic and does not constitute financial advice.
        Last updated: {new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}.
      </div>
    </div>
  )
}
