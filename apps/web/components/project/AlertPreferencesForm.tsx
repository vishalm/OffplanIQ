'use client'
// apps/web/components/project/AlertPreferencesForm.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AlertPreferences } from '@offplaniq/shared'

export function AlertPreferencesForm({
  prefs,
  userId,
}: {
  prefs: AlertPreferences | null
  userId: string
}) {
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState({
    score_drop_threshold:    prefs?.score_drop_threshold ?? 5,
    notify_new_launches:     prefs?.notify_new_launches ?? true,
    notify_handover_delays:  prefs?.notify_handover_delays ?? true,
    notify_sellthrough_stall:prefs?.notify_sellthrough_stall ?? true,
    email_alerts:            prefs?.email_alerts ?? true,
    weekly_digest:           prefs?.weekly_digest ?? true,
  })

  const supabase = createClient()

  async function save() {
    await supabase.from('alert_preferences').upsert({ user_id: userId, ...values } as any)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggles: { key: keyof typeof values; label: string; sub: string }[] = [
    { key: 'notify_new_launches',      label: 'New launches',       sub: 'Matching your saved area filters' },
    { key: 'notify_handover_delays',   label: 'Handover delays',    sub: 'When RERA filings show a push-back' },
    { key: 'notify_sellthrough_stall', label: 'Sell-through stall', sub: '<5% change over 60 days' },
    { key: 'email_alerts',             label: 'Email alerts',       sub: 'Immediate email per alert' },
    { key: 'weekly_digest',            label: 'Sunday digest',      sub: 'Weekly summary email at 9am UAE' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Alert settings</p>
      </div>
      <div className="p-4 space-y-1">
        <div className="flex items-center justify-between py-2 border-b border-gray-50">
          <div>
            <p className="text-sm text-gray-700">Score drop threshold</p>
            <p className="text-xs text-gray-400">Alert when score drops ≥ N points</p>
          </div>
          <select
            value={values.score_drop_threshold}
            onChange={e => setValues(v => ({ ...v, score_drop_threshold: +e.target.value }))}
            className="text-xs border border-gray-200 rounded-md px-2 py-1"
          >
            {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n} pts</option>)}
          </select>
        </div>

        {toggles.map(t => (
          <div key={t.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm text-gray-700">{t.label}</p>
              <p className="text-xs text-gray-400">{t.sub}</p>
            </div>
            <button
              onClick={() => setValues(v => ({ ...v, [t.key]: !v[t.key as keyof typeof v] }))}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                values[t.key] ? 'bg-gray-900' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                values[t.key] ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>
        ))}

        <button
          onClick={save}
          className="w-full mt-3 text-sm py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition"
        >
          {saved ? 'Saved!' : 'Save preferences'}
        </button>
      </div>
    </div>
  )
}
