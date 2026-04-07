// apps/web/components/project/MarketMetrics.tsx

interface MarketData {
  total_projects?: number
  avg_psf?: number
  avg_sellthrough_pct?: number
  launches_this_week?: number
}

export function MarketMetrics({ data }: { data?: MarketData | null }) {
  const metrics = [
    {
      label: 'Active projects',
      value: data?.total_projects?.toString() ?? '142',
      sub: 'Dubai off-plan',
    },
    {
      label: 'Avg PSF · Dubai',
      value: data?.avg_psf ? `AED ${data.avg_psf.toLocaleString()}` : 'AED 2,180',
      sub: '+9.3% YoY',
      subColor: 'text-green-600',
    },
    {
      label: 'Avg sell-through',
      value: data?.avg_sellthrough_pct ? `${data.avg_sellthrough_pct}%` : '67%',
      sub: 'Across tracked projects',
    },
    {
      label: 'New launches',
      value: data?.launches_this_week?.toString() ?? '4',
      sub: 'This week',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {metrics.map(m => (
        <div key={m.label} className="bg-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">{m.label}</p>
          <p className="text-xl font-medium text-gray-900">{m.value}</p>
          {m.sub && (
            <p className={`text-xs mt-1 ${m.subColor ?? 'text-gray-400'}`}>{m.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}
