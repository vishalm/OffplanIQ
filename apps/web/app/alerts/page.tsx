// apps/web/app/alerts/page.tsx
// SCREEN 3: Alerts + Watchlist
// Two-column layout:
//   Left: Live alert feed (unread highlighted)
//   Right: Watchlist manager + alert preferences

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertFeed } from '@/components/project/AlertFeed'
import { WatchlistPanel } from '@/components/project/WatchlistPanel'
import { AlertPreferencesForm } from '@/components/project/AlertPreferencesForm'

export default async function AlertsPage() {
  const supabase = createServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')

  // Fetch alerts (last 50, newest first)
  const { data: alertsRaw } = await supabase
    .from('alerts_log')
    .select('*, project:project_id(name, slug, score, area)')
    .eq('user_id', session.user.id)
    .order('sent_at', { ascending: false })
    .limit(50)
  const alerts = (alertsRaw ?? []) as any[]

  // Fetch watchlist with project data
  const { data: watchlistRaw } = await supabase
    .from('watchlist')
    .select('id, created_at, project:project_id(id, name, slug, area, score, current_psf, sellthrough_pct, handover_status)')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
  const watchlist = (watchlistRaw ?? []) as any[]

  // Fetch alert preferences
  const { data: prefsRaw } = await supabase
    .from('alert_preferences')
    .select('*')
    .eq('user_id', session.user.id)
    .single()
  const prefs = prefsRaw as any

  const unreadCount = alerts.filter((a: any) => !a.is_read).length

  // Mark all as read (fire and forget)
  if (unreadCount > 0) {
    supabase
      .from('alerts_log')
      .update({ is_read: true } as any)
      .eq('user_id', session.user.id)
      .eq('is_read', false)
      .then(() => {})
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium text-gray-900">Alerts & watchlist</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-amber-600 mt-1">{unreadCount} unread alerts</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Alert feed */}
          <div className="lg:col-span-2">
            <AlertFeed alerts={alerts ?? []} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <WatchlistPanel entries={watchlist ?? []} userId={session.user.id} />
            <AlertPreferencesForm prefs={prefs} userId={session.user.id} />
          </div>

        </div>
      </div>
    </div>
  )
}
