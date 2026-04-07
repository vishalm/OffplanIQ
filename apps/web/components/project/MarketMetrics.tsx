interface MarketData {
  total_projects?: number
  avg_psf?: number
  avg_sellthrough_pct?: number
  launches_this_week?: number
}

export function MarketMetrics({ data }: { data?: MarketData | null }) {
  const metrics = [
    {
      label: 'Tracked projects',
      value: data?.total_projects?.toString() ?? '43',
      sub: 'Across UAE',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      ),
    },
    {
      label: 'Avg PSF',
      value: data?.avg_psf ? `${data.avg_psf.toLocaleString()}` : '2,180',
      prefix: 'AED',
      sub: '+9.3% YoY',
      subColor: 'text-green-600',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      ),
    },
    {
      label: 'Sell-through',
      value: data?.avg_sellthrough_pct ? `${data.avg_sellthrough_pct}%` : '67%',
      sub: 'Market average',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      label: 'New this week',
      value: data?.launches_this_week?.toString() ?? '4',
      sub: 'Launches',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 mb-8 stagger">
      {metrics.map(m => (
        <div key={m.label} className="metric-card group">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-blue-50 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
              {m.icon}
            </div>
            <span className="metric-label">{m.label}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            {m.prefix && <span className="text-sm font-medium text-gray-400">{m.prefix}</span>}
            <span className="metric-value">{m.value}</span>
          </div>
          {m.sub && (
            <p className={`metric-sub ${m.subColor ?? ''}`}>{m.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}
