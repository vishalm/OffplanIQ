// apps/web/components/project/DeveloperCard.tsx
import type { Developer } from '@offplaniq/shared'

export function DeveloperCard({ developer }: { developer: Developer | null | undefined }) {
  if (!developer) return null

  const metrics = [
    { label: 'On-time delivery', value: developer.on_time_delivery_pct != null ? `${developer.on_time_delivery_pct}%` : '-', good: (developer.on_time_delivery_pct ?? 0) >= 80 },
    { label: 'RERA complaints',  value: developer.rera_complaints_count.toString(), good: developer.rera_complaints_count <= 5 },
    { label: 'RERA violations',  value: developer.rera_violations_count.toString(), good: developer.rera_violations_count === 0 },
    { label: 'Avg ROI (historical)', value: developer.avg_roi_pct != null ? `+${developer.avg_roi_pct}%` : '-', good: (developer.avg_roi_pct ?? 0) >= 15 },
    { label: 'Active projects',  value: developer.active_projects.toString(), good: true },
    { label: 'Developer score',  value: developer.developer_score != null ? `${developer.developer_score}/100` : '-', good: (developer.developer_score ?? 0) >= 70 },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
          {developer.name[0]}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{developer.name}</p>
          <p className="text-xs text-gray-400">
            {developer.founded_year ? `Est. ${developer.founded_year}` : ''} · {developer.total_projects_count} total projects
          </p>
        </div>
        {developer.developer_score != null && (
          <span className={`ml-auto text-sm font-medium px-3 py-1 rounded-lg ${
            developer.developer_score >= 80 ? 'bg-green-50 text-green-700' :
            developer.developer_score >= 60 ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-600'
          }`}>
            Score {developer.developer_score}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-medium ${m.good ? 'text-green-700' : 'text-red-600'}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
