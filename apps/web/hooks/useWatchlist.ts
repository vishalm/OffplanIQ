// apps/web/hooks/useWatchlist.ts
// Client-side hook for watchlist state management.
// Keeps local state in sync so WatchlistButton updates instantly
// without a page refresh.

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useWatchlist(userId: string) {
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('watchlist')
      .select('project_id')
      .eq('user_id', userId)
      .then(({ data }) => {
        setWatchedIds(new Set((data ?? []).map(r => r.project_id)))
        setLoading(false)
      })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(projectId: string) {
    const watching = watchedIds.has(projectId)

    // Optimistic update
    setWatchedIds(prev => {
      const next = new Set(prev)
      watching ? next.delete(projectId) : next.add(projectId)
      return next
    })

    const res = await fetch('/api/watchlist', {
      method:  watching ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ project_id: projectId }),
    })

    // Revert on error
    if (!res.ok) {
      setWatchedIds(prev => {
        const next = new Set(prev)
        watching ? next.add(projectId) : next.delete(projectId)
        return next
      })
    }
  }

  return { watchedIds, loading, toggle, isWatching: (id: string) => watchedIds.has(id) }
}
