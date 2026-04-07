// apps/web/hooks/useAlerts.ts
// Real-time alert subscription using Supabase Realtime.
// Feeds the unread badge in the Nav — updates without page refresh.

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AlertLogEntry } from '@offplaniq/shared'

export function useUnreadAlertCount(userId: string) {
  const [count, setCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    // Initial fetch
    supabase
      .from('alerts_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .then(({ count: c }) => setCount(c ?? 0))

    // Real-time subscription — fires when a new alert is inserted
    const channel = supabase
      .channel(`alerts:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'alerts_log',
          filter: `user_id=eq.${userId}`,
        },
        () => setCount(n => n + 1)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function markAllRead() { setCount(0) }

  return { count, markAllRead }
}
