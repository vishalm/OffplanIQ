'use client'
// apps/web/components/project/WatchlistButton.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function WatchlistButton({
  projectId, userId, isWatchlisted: initial,
}: {
  projectId: string
  userId: string
  isWatchlisted: boolean
}) {
  const [watching, setWatching] = useState(initial)
  const [loading, setLoading]   = useState(false)
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    if (watching) {
      await supabase.from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId)
    } else {
      await supabase.from('watchlist')
        .insert({ user_id: userId, project_id: projectId } as any)
    }
    setWatching(!watching)
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition ${
        watching
          ? 'bg-gray-900 text-white border-gray-900'
          : 'border-gray-200 text-gray-600 hover:border-gray-400'
      }`}
    >
      <svg className="w-4 h-4" fill={watching ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      {watching ? 'Watching' : 'Watch'}
    </button>
  )
}
