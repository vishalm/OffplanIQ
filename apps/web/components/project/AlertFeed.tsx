// apps/web/components/project/AlertFeed.tsx
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { AlertLogEntry } from '@offplaniq/shared'

const ALERT_ICONS: Record<string, string> = {
  score_drop:       '↓',
  score_rise:       '↑',
  new_launch:       '★',
  handover_delay:   '!',
  psf_spike:        '↑',
  psf_drop:         '↓',
  sellthrough_stall:'~',
  developer_flag:   '⚑',
}

const ALERT_COLORS: Record<string, string> = {
  score_drop:       'bg-red-50 text-red-600',
  score_rise:       'bg-green-50 text-green-600',
  new_launch:       'bg-blue-50 text-blue-600',
  handover_delay:   'bg-amber-50 text-amber-600',
  psf_spike:        'bg-green-50 text-green-600',
  psf_drop:         'bg-red-50 text-red-600',
  sellthrough_stall:'bg-gray-100 text-gray-500',
  developer_flag:   'bg-orange-50 text-orange-600',
}

export function AlertFeed({ alerts }: { alerts: AlertLogEntry[] }) {
  if (!alerts.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <p className="text-gray-400 text-sm">No alerts yet. Add projects to your watchlist to get started.</p>
        <Link href="/dashboard" className="text-sm text-gray-900 underline mt-2 inline-block">
          Browse projects →
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Alert feed</p>
      </div>
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`flex gap-4 px-5 py-4 border-b border-gray-50 last:border-0 ${!alert.is_read ? 'bg-blue-50/30' : ''}`}
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${ALERT_COLORS[alert.alert_type] ?? 'bg-gray-100 text-gray-500'}`}>
            {ALERT_ICONS[alert.alert_type] ?? '·'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{alert.title}</p>
            {alert.body && <p className="text-xs text-gray-500 mt-0.5">{alert.body}</p>}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(alert.sent_at), { addSuffix: true })}
              </p>
              {alert.project && (
                <Link href={`/projects/${(alert.project as any).slug}`} className="text-xs text-gray-500 underline">
                  {(alert.project as any).name}
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
